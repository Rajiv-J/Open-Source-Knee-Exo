# Tools

Scripts and commands used to build the site's 3D assets. None of these run on
the website itself.

## Squat simulation model (`static/models/squat_model.glb` + `squat_data.json`)

Built from the Hyfydy/SCONE files with `build_squat_model.py`:

```bash
python3 tools/build_squat_model.py \
    --hfd H0709v2j.hfd --sto episode_10_895.335.sto \
    --geometry path/to/scone/geometry --mirror --start 2.09 --end 9.06 \
    --out static/models/squat_model.glb --data-out static/models/squat_data.json
```

Requires `numpy`, `trimesh`, `pygltflib`.

## Knee exoskeleton CAD model (`static/models/knee_exo_v2.glb`)

The exported CAD GLB (~233 MB, ~4M triangles) is too large for GitHub (100 MB
file limit) and for the web, so it is optimized with
[glTF Transform](https://gltf-transform.dev/):

```bash
npx @gltf-transform/cli@4 optimize Knee_Exo_V2_Model.glb static/models/knee_exo_v2.glb \
    --compress draco --texture-compress webp \
    --simplify-ratio 0.25 --simplify-error 0.0005
```

Result: ~2.8 MB, ~0.9M triangles (Draco-compressed; the page's model viewer
decodes it automatically). After replacing the file, bump the `?v=` number on
its `src` in `index.html` so browsers load the new version.
