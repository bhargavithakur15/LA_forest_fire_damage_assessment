# LA Forest Fire Damage Assessment

Google Earth Engine (GEE) scripts for assessing forest/vegetation damage from the 2025 Los Angeles wildfires using Sentinel-2 and Landsat 8 optical imagery.

## Scripts

- **`basic_LA_fire_NDVI_.js`** — Interactive Earth Engine app that computes pre-/post-fire NDVI and dNDVI, classifies burn severity (low/moderate/high), and lets the user draw a custom area of interest to get acreage metrics on demand.
- **`LA_fire_NBR.js`** — Advanced Normalized Burn Ratio (NBR/dNBR) workflow with BRDF normalization and terrain illumination correction for more accurate severity mapping.
- **`LA2025_fire.js`** — NBR/dNBR burn severity classification with an interactive time-series chart: click any point on the map to plot its NBR trajectory over time.
- **`Accuracy_LAfire.js`** — Validates Sentinel-2-derived NDVI burn severity classification against BAER (Burned Area Emergency Response) dNBR ground-truth data using an error matrix (overall, producer's, and consumer's accuracy).
- **`Change_Detection.js`** — Multi-year (2014–2020) Landsat 8 EVI change detection and anomaly analysis, including yearly composites, a time-series GIF, and standard anomaly (Z-score) maps.

## Methodology

Damage is detected by comparing vegetation index values (NDVI or NBR) computed from cloud-masked, atmospherically corrected surface reflectance imagery before and after the fire event. The difference (dNDVI/dNBR) is thresholded into severity classes, and burned area is estimated by summing pixel area within each class over a region of interest.

## Requirements

These scripts are written for the [Google Earth Engine Code Editor](https://code.earthengine.google.com/) (JavaScript API). Some scripts reference project-specific assets or map geometries (e.g. `accurate_zone`, `studyArea`, `roi`) that must be defined or imported in the Code Editor before running.
