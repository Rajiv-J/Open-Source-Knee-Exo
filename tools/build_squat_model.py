#!/usr/bin/env python3
"""Build the animated squat model (GLB) shown on the project page.

Reads a Hyfydy model (.hfd), a SCONE/Hyfydy motion file (.sto) and a folder
of bone meshes (.vtp), and writes a GLB with:
  - bones for every body, animated from the recorded body positions/rotations
  - muscles drawn as tubes along their point paths, one material per muscle
    (named "muscle:<name>") so the page can colour them by activation
  - an optional mirrored left leg (visual copy of the right leg)
  - a floor disc at y = 0

Example:
  python3 tools/build_squat_model.py \
      --hfd H0709v2j.hfd --sto episode_10_895.335.sto \
      --geometry path/to/geometry --mirror --start 2.09 --end 9.06 \
      --out static/models/squat_model.glb --data-out static/models/squat_data.json

The JSON holds, per animation frame, each muscle's activation and the total
knee muscle moment (sum of '<muscle>.knee_angle_r.moment', extension +, Nm).

Requires: numpy, trimesh, pygltflib
"""
import argparse
import json
import os
import re

import numpy as np
import pygltflib as gl
import trimesh

# Bone mesh names used by the model -> file to load when the exact name is
# missing (lets the public OpenSim Geometry folder stand in for SCONE's).
MESH_FALLBACKS = {
    "femur.vtp": ["femur_r.vtp", "r_femur.vtp"],
    "tibia.vtp": ["r_tibia.vtp", "tibia_r.vtp"],
}

BONE_COLOR = [0.92, 0.89, 0.82, 1.0]
MUSCLE_COLOR = [0.45, 0.22, 0.22, 1.0]  # relaxed colour; the page tints by activation
FLOOR_COLOR = [0.85, 0.85, 0.85, 1.0]
MUSCLE_RADIUS = 0.009
FRAME_STEP = 3  # keep every Nth .sto row


# ---------------------------------------------------------------- parsing ----
def parse_zml(text):
    """Parse Hyfydy/SCONE 'zml' text into nested dicts.

    Every key maps to a list of values (keys can repeat, e.g. 'body').
    """
    text = re.sub(r"#[^\n]*", "", text)
    tokens = re.findall(r"[{}\[\]=]|[^\s{}\[\]=]+", text)
    pos = 0

    def block(end):
        nonlocal pos
        d = {}
        while pos < len(tokens) and tokens[pos] != end:
            key, nxt = tokens[pos], tokens[pos + 1]
            pos += 2
            if nxt == "=":
                value = tokens[pos]
                pos += 1
            elif nxt == "{":
                value = block("}")
                pos += 1
            elif nxt == "[":
                value = []
                while tokens[pos] == "{":
                    pos += 1
                    value.append(block("}"))
                    pos += 1
                pos += 1  # skip ']'
            else:
                raise ValueError(f"Unexpected token after {key!r}: {nxt!r}")
            d.setdefault(key, []).append(value)
        return d

    return block(None)


def one(d, key, default=None):
    """First value stored under key (see parse_zml)."""
    return d[key][0] if key in d else default


def vec(d):
    return np.array([float(one(d, a, 0)) for a in "xyz"]) if d else np.zeros(3)


def read_sto(path):
    with open(path) as f:
        text = f.read()
    body = text.split("endheader", 1)[1].strip().split("\n")
    header = body[0].split("\t")
    data = np.array([[float(x) for x in line.split("\t")] for line in body[1:] if line.strip()])
    return header, data


def read_vtp(path):
    text = open(path).read()
    pts = re.search(r"<Points>\s*<DataArray[^>]*>(.*?)</DataArray>", text, re.S).group(1)
    polys = re.search(r"<Polys>(.*?)</Polys>", text, re.S).group(1)
    conn = re.search(r'Name="connectivity"[^>]*>(.*?)</DataArray>', polys, re.S).group(1)
    offs = re.search(r'Name="offsets"[^>]*>(.*?)</DataArray>', polys, re.S).group(1)
    v = np.array(pts.split(), float).reshape(-1, 3)
    conn = np.array(conn.split(), int)
    offs = np.array(offs.split(), int)
    faces, start = [], 0
    for end in offs:
        poly = conn[start:end]
        faces += [[poly[0], poly[i], poly[i + 1]] for i in range(1, len(poly) - 1)]
        start = end
    return v, np.array(faces)


# ----------------------------------------------------------------- math -------
def quat_mirror(q):
    """Mirror a (w, x, y, z) rotation across the z = 0 plane."""
    w, x, y, z = q.T
    return np.stack([w, -x, -y, z], axis=-1)


def quat_rotate(q, v):
    """Rotate vectors v (N,3) by quaternions q (N,4) in (w, x, y, z)."""
    w, u = q[:, :1], q[:, 1:]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def quat_from_y_to(d):
    """Quaternions (w, x, y, z) rotating +Y onto unit vectors d (N,3)."""
    y = np.array([0.0, 1.0, 0.0])
    axis = np.cross(np.broadcast_to(y, d.shape), d)
    w = 1 + d[:, 1]
    q = np.concatenate([w[:, None], axis], axis=1)
    bad = w < 1e-8  # pointing straight down
    q[bad] = [0, 0, 0, 1]
    return q / np.linalg.norm(q, axis=1, keepdims=True)


# ------------------------------------------------------------ glTF writer ----
class GlbWriter:
    def __init__(self):
        self.g = gl.GLTF2(asset=gl.Asset(generator="build_squat_model.py"))
        self.g.scenes = [gl.Scene(nodes=[])]
        self.blob = bytearray()

    def _view(self, arr, target=None):
        data = arr.tobytes()
        while len(self.blob) % 4:
            self.blob += b"\0"
        self.g.bufferViews.append(gl.BufferView(buffer=0, byteOffset=len(self.blob),
                                                byteLength=len(data), target=target))
        self.blob += data
        return len(self.g.bufferViews) - 1

    def accessor(self, arr, kind, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        ctype = gl.FLOAT if arr.dtype == np.float32 else gl.UNSIGNED_INT
        acc = gl.Accessor(bufferView=self._view(arr, target), componentType=ctype,
                          count=len(arr), type=kind)
        if minmax:
            flat = arr.reshape(len(arr), -1)
            acc.min = flat.min(0).tolist()
            acc.max = flat.max(0).tolist()
        self.g.accessors.append(acc)
        return len(self.g.accessors) - 1

    def material(self, rgba, name):
        self.g.materials.append(gl.Material(
            name=name, doubleSided=True,
            pbrMetallicRoughness=gl.PbrMetallicRoughness(
                baseColorFactor=rgba, metallicFactor=0.0, roughnessFactor=0.7)))
        return len(self.g.materials) - 1

    def geometry(self, verts, faces):
        """Upload a triangle mesh; returns (position, normal, index) accessors."""
        m = trimesh.Trimesh(verts, faces, process=True)
        pos = self.accessor(m.vertices.astype(np.float32), gl.VEC3, gl.ARRAY_BUFFER, True)
        nrm = self.accessor(m.vertex_normals.astype(np.float32), gl.VEC3, gl.ARRAY_BUFFER)
        idx = self.accessor(m.faces.astype(np.uint32).ravel(), gl.SCALAR, gl.ELEMENT_ARRAY_BUFFER)
        return pos, nrm, idx

    def mesh(self, geometry, material, name):
        pos, nrm, idx = geometry
        self.g.meshes.append(gl.Mesh(name=name, primitives=[gl.Primitive(
            attributes=gl.Attributes(POSITION=pos, NORMAL=nrm), indices=idx, material=material)]))
        return len(self.g.meshes) - 1

    def node(self, name, parent=None, **kw):
        self.g.nodes.append(gl.Node(name=name, children=[], **kw))
        i = len(self.g.nodes) - 1
        if parent is None:
            self.g.scenes[0].nodes.append(i)
        else:
            self.g.nodes[parent].children.append(i)
        return i

    def save(self, path):
        self.g.buffers = [gl.Buffer(byteLength=len(self.blob))]
        self.g.set_binary_blob(bytes(self.blob))
        self.g.save_binary(path)


# ------------------------------------------------------------------ build ----
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hfd", required=True)
    ap.add_argument("--sto", required=True)
    ap.add_argument("--geometry", required=True, help="folder with .vtp bone meshes")
    ap.add_argument("--out", required=True)
    ap.add_argument("--mirror", action="store_true", help="add a mirrored left leg")
    ap.add_argument("--start", type=float, default=None, help="clip start time (s)")
    ap.add_argument("--end", type=float, default=None, help="clip end time (s)")
    ap.add_argument("--data-out", default=None, help="write activations + knee moment JSON")
    args = ap.parse_args()

    model = one(parse_zml(open(args.hfd).read()), "model")
    bodies = [b for b in model["body"] if one(b, "name") != "ground"]
    muscles = model.get("point_path_muscle", [])
    header, data = read_sto(args.sto)
    col = {h: i for i, h in enumerate(header)}
    t_all = data[:, col["time"]]
    keep = np.ones(len(data), bool)
    if args.start is not None:
        keep &= t_all >= args.start - 1e-9
    if args.end is not None:
        keep &= t_all <= args.end + 1e-9
    data = data[keep]
    rows = list(range(0, len(data), FRAME_STEP))
    if rows[-1] != len(data) - 1:
        rows.append(len(data) - 1)  # always end exactly on the clip's last frame
    data = data[rows]
    times = (data[:, col["time"]] - data[0, col["time"]]).astype(np.float32)

    # Per-body world transforms (pos + quaternion w,x,y,z) for every frame.
    def track(name):
        p = data[:, [col[f"{name}.pos.{a}"] for a in "xyz"]]
        q = data[:, [col[f"{name}.ori.{a}"] for a in "wxyz"]]
        return p, q / np.linalg.norm(q, axis=1, keepdims=True)

    tracks = {one(b, "name"): track(one(b, "name")) for b in bodies}

    # Rest pose = tallest (standing) frame, so viewers frame the whole motion.
    rest = int(np.argmax(tracks["pelvis"][0][:, 1]))

    # Centre the model over the floor origin (keep height so the floor is y = 0).
    centre = tracks["pelvis"][0].mean(axis=0) * [1, 0, 0]

    leg_bodies = {one(b, "name") for b in bodies if one(b, "name").endswith("_r")}
    sides = [("", 1.0)] + ([("_l", -1.0)] if args.mirror else [])

    w = GlbWriter()
    bone_mat = w.material(BONE_COLOR, "bone")
    floor_mat = w.material(FLOOR_COLOR, "floor")
    root = w.node("squat_model", translation=(-centre).tolist())

    mesh_cache = {}

    def bone_mesh(fname, mirror):
        key = (fname, mirror)
        if key not in mesh_cache:
            for cand in [fname] + MESH_FALLBACKS.get(fname, []):
                path = os.path.join(args.geometry, cand)
                if os.path.exists(path):
                    break
            else:
                raise FileNotFoundError(f"No mesh for {fname} in {args.geometry}")
            v, f = read_vtp(path)
            if mirror:
                v = v * [1, 1, -1]
                f = f[:, ::-1]
            mesh_cache[key] = w.mesh(w.geometry(v, f), bone_mat, fname + (" (mirrored)" if mirror else ""))
        return mesh_cache[key]

    channels, samplers = [], []
    t_acc = w.accessor(times, gl.SCALAR, minmax=True)

    def animate(node, path, values, kind):
        setattr(w.g.nodes[node], path, values[rest].astype(float).tolist())
        samplers.append(gl.AnimationSampler(input=t_acc, output=w.accessor(values.astype(np.float32), kind),
                                            interpolation="LINEAR"))
        channels.append(gl.AnimationChannel(sampler=len(samplers) - 1,
                                            target=gl.AnimationChannelTarget(node=node, path=path)))

    def world_tracks(name, sign):
        p, q = tracks[name]
        if sign < 0:
            p, q = p * [1, 1, -1], quat_mirror(q)
        return p, q

    # Bones
    for suffix, sign in sides:
        for b in bodies:
            name = one(b, "name")
            if sign < 0 and name not in leg_bodies:
                continue
            p, q = world_tracks(name, sign)
            n = w.node(name.replace("_r", suffix) if sign < 0 else name, parent=root)
            animate(n, "translation", p, gl.VEC3)
            animate(n, "rotation", q[:, [1, 2, 3, 0]], gl.VEC4)  # glTF wants x,y,z,w
            for m in b.get("mesh", []):
                fname = one(m, "file")
                off = vec(one(m, "pos")) * [1, 1, sign]
                w.node(fname, parent=n, mesh=bone_mesh(fname, sign < 0), translation=off.tolist())

    # Muscles: one tube per path segment, stretched between its two points.
    tube = trimesh.creation.cylinder(radius=MUSCLE_RADIUS, height=1.0, sections=12)
    tube.apply_translation([0, 0, 0.5])
    tube.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))  # z -> y
    tube_geom = w.geometry(tube.vertices, tube.faces)
    for suffix, sign in sides:
        for mus in muscles:
            pts = []
            for pt in one(mus, "path"):
                p, q = world_tracks(one(pt, "body"), sign)
                local = np.broadcast_to(vec(one(pt, "pos")) * [1, 1, sign], p.shape)
                pts.append(p + quat_rotate(q, local))
            label = one(mus, "name").replace("_r", suffix) if sign < 0 else one(mus, "name")
            tube_mesh = w.mesh(tube_geom, w.material(MUSCLE_COLOR, "muscle:" + label), label)
            for i in range(len(pts) - 1):
                d = pts[i + 1] - pts[i]
                length = np.linalg.norm(d, axis=1)
                n = w.node(f"{label}_{i}", parent=root, mesh=tube_mesh)
                animate(n, "translation", pts[i], gl.VEC3)
                animate(n, "rotation", quat_from_y_to(d / length[:, None])[:, [1, 2, 3, 0]], gl.VEC4)
                animate(n, "scale", np.stack([np.ones_like(length), length, np.ones_like(length)], 1), gl.VEC3)

    # Floor
    disc = trimesh.creation.cylinder(radius=0.45, height=0.01, sections=64)
    disc.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    disc.apply_translation([0, -0.005, 0])
    w.node("floor", mesh=w.mesh(w.geometry(disc.vertices, disc.faces), floor_mat, "floor"))

    w.g.animations = [gl.Animation(name="squat", channels=channels, samplers=samplers)]
    w.save(args.out)

    if args.data_out:
        knee = sum(data[:, i] for h, i in col.items() if h.endswith(".knee_angle_r.moment"))
        out = {
            "times": np.round(times, 3).tolist(),
            "knee_moment": np.round(knee, 2).tolist(),
            "activations": {one(m, "name"): np.round(data[:, col[one(m, "name") + ".activation"]], 3).tolist()
                            for m in muscles},
        }
        with open(args.data_out, "w") as f:
            json.dump(out, f, separators=(",", ":"))
        print(f"Wrote {args.data_out}")
    print(f"Wrote {args.out}: {len(times)} frames, {times[-1]:.2f} s, "
          f"{os.path.getsize(args.out) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
