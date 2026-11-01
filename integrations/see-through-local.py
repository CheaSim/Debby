"""Debby asset authoring entry point; See-through remains an external dependency."""
import argparse
import gc
import os
from pathlib import Path

for key in ("OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "OMP_NUM_THREADS"):
    os.environ.setdefault(key, "8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--srcp", required=True)
    parser.add_argument("--save_dir", required=True)
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--repo_id_layerdiff", default="layerdifforg/seethroughv0.0.2_layerdiff3d")
    parser.add_argument("--repo_id_depth", default="24yearsold/seethroughv0.0.1_marigold")
    parser.add_argument("--group_offload", action="store_true")
    parser.add_argument("--save_to_psd", action="store_true")
    parser.add_argument("--tblr_split", action="store_true")
    args = parser.parse_args()

    import torch
    from utils import inference_utils as inference
    from utils.torch_utils import seed_everything

    if not torch.cuda.is_available():
        raise RuntimeError("See-through needs a supported CUDA/ROCm GPU runtime.")
    seed_everything(args.seed)
    print("Generating semantic parts...", flush=True)
    inference.apply_layerdiff(args.srcp, args.repo_id_layerdiff, save_dir=args.save_dir,
                              seed=args.seed, resolution=args.resolution,
                              num_inference_steps=30, group_offload=args.group_offload)
    # The depth pass does not use LayerDiff. Holding both pipelines can exhaust
    # a 16 GB GPU even when each pass individually fits with group offload.
    inference.layerdiff_pipeline = None
    gc.collect()
    torch.cuda.empty_cache()
    print("Sorting depth and exporting PSD...", flush=True)
    inference.apply_marigold(args.srcp, args.repo_id_depth, save_dir=args.save_dir,
                            seed=args.seed, resolution=768, group_offload=args.group_offload)
    inference.further_extr(str(Path(args.save_dir) / Path(args.srcp).stem), rotate=False,
                           save_to_psd=args.save_to_psd, tblr_split=args.tblr_split)


if __name__ == "__main__":
    main()
