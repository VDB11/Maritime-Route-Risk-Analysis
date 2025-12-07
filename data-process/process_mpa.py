import os
import glob
import zipfile
import geopandas as gpd
import tempfile
import pandas as pd
import shutil
import json

# Load configuration
with open("config.json", "r") as f:
    config = json.load(f)

INPUT_FOLDER = config["files_and_folders"]["input_folder"]
OUTPUT_FOLDER = config["files_and_folders"]["output_folder"]
OUTPUT_ZIP = config["files_and_folders"]["output_zip_name"]
LOG_FILE = config["files_and_folders"]["log_file"]
SUMMARY_CSV = config["files_and_folders"]["summary_csv"]
TEMP_PREFIX = config["files_and_folders"]["temp_prefix"]
INPUT_ZIP_PATTERN = config["files_and_folders"]["input_zip_pattern"]
OUTPUT_SHP_NAME = config["files_and_folders"]["output_shp_name"]

def log_message(message, print_to_console=True):
    """Log a message to file."""
    with open(LOG_FILE, "a", encoding="utf-8") as log:
        timestamp = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
        log.write(f"[{timestamp}] {message}\n")
    if print_to_console:
        print(message)

def extract_zip(zip_path):
    """Extracts a ZIP into a temp folder and returns the folder path."""
    tmp_dir = tempfile.mkdtemp(prefix=TEMP_PREFIX)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(tmp_dir)
    log_message(f"Extracted {os.path.basename(zip_path)} to temp folder")
    return tmp_dir

def save_summary_csv(gdf, output_path):
    """Save a summary CSV with key statistics."""
    summary_data = {
        "total_features": [len(gdf)],
        "total_marine_area_km2": [gdf["GIS_M_AREA"].sum() if "GIS_M_AREA" in gdf.columns else 0],
        "avg_marine_area_km2": [gdf["GIS_M_AREA"].mean() if "GIS_M_AREA" in gdf.columns else 0]
    }
    
    # Add optional columns if they exist
    if "ISO3" in gdf.columns:
        summary_data["unique_countries"] = [len(gdf["ISO3"].unique())]
    if "DESIG" in gdf.columns:
        summary_data["unique_designations"] = [len(gdf["DESIG"].unique())]
    
    summary_df = pd.DataFrame(summary_data)
    summary_df.to_csv(output_path, index=False)
    log_message(f"Saved summary to {output_path}")

# Clear log file
if os.path.exists(LOG_FILE):
    os.remove(LOG_FILE)

log_message("=== STARTING MARINE POLYGONS PROCESSING ===")
log_message(f"Input folder: {INPUT_FOLDER}")
log_message(f"Output folder: {OUTPUT_FOLDER}")

# Find region ZIPs
region_zips = sorted(glob.glob(os.path.join(INPUT_FOLDER, INPUT_ZIP_PATTERN)))
log_message(f"FOUND {len(region_zips)} REGION ZIP FILES:")
for z in region_zips:
    log_message(f"   {os.path.basename(z)}")

if not region_zips:
    log_message("ERROR: No input ZIP files found!", print_to_console=True)
    exit()

all_marine = []
processed_count = 0
skipped_count = 0

for region_zip in region_zips:
    log_message(f"\n=== Processing region: {os.path.basename(region_zip)} ===")

    region_tmp = extract_zip(region_zip)
    internal_zips = sorted(glob.glob(os.path.join(region_tmp, "*.zip")))

    log_message(f"Internal ZIPs found: {[os.path.basename(i) for i in internal_zips]}")

    for iz in internal_zips:
        log_message(f"Processing internal: {os.path.basename(iz)}")

        iz_tmp = extract_zip(iz)

        # Look for polygons shapefile
        shp_list = glob.glob(os.path.join(iz_tmp, "**/*polygons.shp"), recursive=True)
        if not shp_list:
            log_message("No polygons.shp found, skipping.")
            skipped_count += 1
            continue

        shp = shp_list[0]
        log_message(f"Loading: {os.path.basename(shp)}")

        gdf = gpd.read_file(shp)

        # Ensure marine indicator exists
        if "GIS_M_AREA" not in gdf.columns:
            log_message("No GIS_M_AREA column, skipping.")
            skipped_count += 1
            continue

        marine = gdf[gdf["GIS_M_AREA"] > 0]
        log_message(f"Marine features found: {len(marine)}")

        if len(marine) > 0:
            all_marine.append(marine)
            processed_count += 1

    # Clean up temp folder
    shutil.rmtree(region_tmp)

log_message(f"\nProcessed: {processed_count} files | Skipped: {skipped_count} files")

if not all_marine:
    log_message("ERROR: No marine features found!", print_to_console=True)
    exit()

log_message("\nMerging all marine features")

merged = gpd.GeoDataFrame(
    pd.concat(all_marine, ignore_index=True),
    crs=all_marine[0].crs
)

# Log column information
log_message(f"\nOutput columns: {list(merged.columns)}")
log_message(f"Total marine polygons: {len(merged)}")

# Prepare output folder
if os.path.exists(OUTPUT_FOLDER):
    shutil.rmtree(OUTPUT_FOLDER)
os.makedirs(OUTPUT_FOLDER)

shp_path = os.path.join(OUTPUT_FOLDER, OUTPUT_SHP_NAME)
log_message(f"Saving shapefile to: {shp_path}")
merged.to_file(shp_path, driver="ESRI Shapefile")

# Save summary CSV
summary_path = os.path.join(OUTPUT_FOLDER, SUMMARY_CSV)
save_summary_csv(merged, summary_path)

# Zip shapefile components
log_message(f"Creating final ZIP: {OUTPUT_ZIP}")

with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    # Add shapefile components
    for ext in ["shp", "shx", "dbf", "prj", "cpg"]:
        file = f"{OUTPUT_SHP_NAME.replace('.shp', '')}.{ext}"
        full_path = os.path.join(OUTPUT_FOLDER, file)
        if os.path.exists(full_path):
            z.write(full_path, file)
    
    # Add summary CSV
    z.write(summary_path, SUMMARY_CSV)
    
    # Add log file
    if os.path.exists(LOG_FILE):
        z.write(LOG_FILE, LOG_FILE)

log_message("\n=== PROCESSING COMPLETE ===")
log_message(f"Final files created:")
log_message(f"  - {OUTPUT_ZIP}")
log_message(f"  - {LOG_FILE}")
log_message(f"  - Folder: {OUTPUT_FOLDER}/")