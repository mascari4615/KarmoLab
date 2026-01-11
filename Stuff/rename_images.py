import os
import glob

target_dir = r"c:\Users\masca\source\repos\_Mascari4615\KarmoLab\YawnBot\Resources\img\enhancement"
files = glob.glob(os.path.join(target_dir, "*.png"))

print(f"Found {len(files)} png files.")

for file_path in files:
    filename = os.path.basename(file_path)
    new_filename = filename
    
    # 1. Handle bot_asset_ prefix
    if filename.startswith("bot_asset_"):
        new_filename = filename.replace("bot_asset_", "")
    
    # 2. Handle weapon images (contain _Lv)
    # Pattern: {WeaponType}_Lv{Level}_{Title}_{LoreSnippet}.png
    # We want: {WeaponType}_Lv{Level}_{Title}.png
    elif "_Lv" in filename:
        parts = filename.split('_')
        # Check if it matches the pattern (at least 4 parts: Type, LvX, Title, Lore...)
        # Actually, if it has more than 3 parts, we truncate to 3.
        # Example: 곡괭이_Lv10_영혼_... .png
        # parts: [곡괭이, Lv10, 영혼, ...]
        # We want first 3 parts.
        
        # Be careful not to break files that are already correct or different format
        # Check if parts[1] starts with Lv
        if len(parts) > 3 and parts[1].startswith("Lv"):
             # Reconstruct filename
             # parts[0] = Type
             # parts[1] = LvX
             # parts[2] = Title
             # We need to handle the extension in the last part or just append .png
             
             # The last part currently has .png in it if we just split by _.
             # But we are taking the first 3 parts. The 3rd part might not have .png if there are 4 parts.
             # Example: A_Lv1_B_C.png -> parts: [A, Lv1, B, C.png]
             # We want A_Lv1_B.png
             
             base_name = "_".join(parts[:3])
             new_filename = base_name + ".png"

    if new_filename != filename:
        new_path = os.path.join(target_dir, new_filename)
        print(f"Renaming: {filename} -> {new_filename}")
        try:
            os.rename(file_path, new_path)
        except OSError as e:
            print(f"Error renaming {filename}: {e}")

print("Done.")
