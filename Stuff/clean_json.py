import json
import glob
import os
import re

target_dir = r"c:\Users\masca\source\repos\_Mascari4615\KarmoLab\YawnBot\Resources\img\enhancement"
files = glob.glob(os.path.join(target_dir, "*_data.json"))

print(f"Found {len(files)} files.")

for file_path in files:
    print(f"Processing {file_path}...")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if "stages" in data:
        for stage in data["stages"]:
            if "prompt" in stage:
                del stage["prompt"]
            if "visualDescription" in stage:
                del stage["visualDescription"]
            
            if "lore" in stage:
                lore = stage["lore"]
                # Remove translation block: \n\n*(Translation: ...)*
                # Also handle cases where it might be just (Translation: ...)
                # Regex to find Translation: ... )*
                
                # Pattern: \n\n*\(Translation:.*?\)* or similar
                # Let's just look for the specific pattern seen in previous turns
                # "lore": "**...**\n\n*(Translation: ...)*"
                
                # Remove anything starting from \n\n*(Translation:
                lore = re.sub(r"\n\n\*\(Translation:.*?\)\*", "", lore, flags=re.DOTALL)
                lore = re.sub(r"\(Translation:.*?\)", "", lore, flags=re.DOTALL)
                
                stage["lore"] = lore.strip()
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

print("Done.")
