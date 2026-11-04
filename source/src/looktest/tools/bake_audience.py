import bpy, sys, math
argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and 'Mannequin' in o.name]
print('meshes', [o.name for o in bpy.data.objects if o.type=='MESH'])
print("actions", [a.name for a in bpy.data.actions][:60])
def act(name):
    for a in bpy.data.actions:
        if a.name.startswith(name): return a
    raise Exception(name)
poses = [
  ("sit", "Sitting_Idle_Loop", 10, {}),
  ("talk", "Sitting_Talking_Loop", 30, {}),
  ("cheer", "Sitting_Idle_Loop", 10, {"upperarm_l": ((1,0,0), 95), "upperarm_r": ((1,0,0), 95)}),
  ("wave", "Sitting_Talking_Loop", 30, {"upperarm_r": ((1,0,0), 115)}),
]
arm.animation_data_create()
results = []
for name, an, frame, raise_arms in poses:
    arm.animation_data.action = act(an)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    if raise_arms:
        from mathutils import Quaternion, Vector
        saved = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
        arm.animation_data.action = None
        for pb in arm.pose.bones: pb.matrix_basis = saved[pb.name]
        for bn, (ax, ang) in raise_arms.items():
            pb = arm.pose.bones[bn]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(Vector(ax), math.radians(ang))
        bpy.context.view_layer.update()
    copies = []
    for m in meshes:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = m.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
        ob = bpy.data.objects.new(name + "_" + m.name, me)
        ob.matrix_world = m.matrix_world.copy()
        bpy.context.collection.objects.link(ob)
        copies.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for c in copies: c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = "aud_" + name
    j.data.materials.clear()
    mod = j.modifiers.new("dec", 'DECIMATE'); mod.ratio = 0.14
    bpy.ops.object.modifier_apply(modifier="dec")
    print(name, len(j.data.polygons))
    results.append(j)
# remove originals
for o in list(bpy.data.objects):
    if o not in results: bpy.data.objects.remove(o, do_unlink=True)
for i, r in enumerate(results): r.location.x = i * 1.5
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_materials='NONE', export_normals=True, export_texcoords=False)
