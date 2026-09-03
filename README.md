# LA Forest Fire Damage Assessment

Google Earth Engine (GEE) scripts for assessing forest/vegetation damage from the 2025 Los Angeles wildfires using Sentinel-2 and Landsat 8 optical imagery.

## Background

Insurers and land managers assessing wildfire damage to forest assets traditionally rely on manual field inspections, which are slow, costly, and hard to standardize across large or remote areas. Satellite-based monitoring offers an objective, repeatable alternative: optical imagery captures changes in vegetation health that can be quantified before and after a disaster event without site access.

This repository demonstrates that approach using a 2025 Los Angeles wildfire case study over the Santa Monica Mountains. Pre-fire (Nov–Dec 2024) and post-fire (Feb 2025) Sentinel-2 imagery were compared using the Normalized Difference Vegetation Index (NDVI); the change in NDVI (dNDVI) was thresholded into low/moderate/high severity classes. Overlaying a sample land boundary on the resulting severity map estimated that roughly 83% of a ~2,274-acre area was affected, split across the three severity tiers. Cross-checking the classification against Landsat imagery on a common grid showed strong agreement (~85% overall accuracy) between the two satellite platforms.

The broader takeaway is that dNDVI/dNBR-based severity maps can substitute for or prioritize field inspections, provide a consistent basis for claim/loss estimation, and support continued monitoring of recovery — with the caveats that optical imagery is limited by cloud cover (SAR is a weather-independent complement) and seasonal vegetation cycles should be accounted for when setting change thresholds.

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
