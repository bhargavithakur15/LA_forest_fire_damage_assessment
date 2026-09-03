// =========================================================================
// CROSS-SENSOR VALIDATION: SENTINEL-2 vs LANDSAT 8 BURN SEVERITY
// Compares dNDVI-derived burn severity from both platforms on a common
// 30 m grid to estimate agreement/accuracy between sensors.
// =========================================================================

// 1. Area of Interest - matches the AOI used in basic_LA_fire_NDVI_.js
var aoi = ee.Geometry.Polygon([
  [[-118.70, 34.20], [-118.70, 34.00], [-118.00, 34.00], [-118.00, 34.20]]
]);
Map.centerObject(aoi, 11);

// Water (ocean, reservoirs) has very low, unstable reflectance in the red/NIR
// bands, so NDVI over water is noisy — sunglint or wave state differences
// between the pre- and post-fire composite dates alone can produce a dNDVI
// swing that crosses the burn threshold. Mask water out before classifying.
var landMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('max_extent').eq(0);

// 2. Temporal Windows (Pre-fire vs Post-fire)
var preStart = '2024-11-01';
var preEnd   = '2024-12-25';
var postStart = '2025-02-01';
var postEnd   = '2025-02-28';

// =========================================================================
// SENTINEL-2 PROCESSING (native 10 m)
// =========================================================================

function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000)
              .copyProperties(image, ['system:time_start']);
}

var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi);

var s2Pre = s2Collection.filterDate(preStart, preEnd)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(maskS2clouds).median();

var s2Post = s2Collection.filterDate(postStart, postEnd)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(maskS2clouds).median();

// median() composites lose their native per-pixel projection, so it must be
// restored explicitly (from a raw scene) before any resampling can occur.
var s2NativeProjection = s2Collection.first().select('B4').projection();

var s2dNDVI = s2Pre.normalizedDifference(['B8', 'B4'])
  .subtract(s2Post.normalizedDifference(['B8', 'B4']))
  .rename('dNDVI')
  .setDefaultProjection(s2NativeProjection)
  .updateMask(landMask);

// =========================================================================
// LANDSAT 8 PROCESSING (native 30 m)
// =========================================================================

function maskL8sr(image) {
  var qa = image.select('QA_PIXEL');
  var cloudShadowBitMask = 1 << 3;
  var cloudsBitMask = 1 << 5;
  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
      .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return image.updateMask(mask).multiply(0.0000275).add(-0.2)
              .copyProperties(image, ['system:time_start']);
}

var l8Collection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(aoi);

var l8Pre = l8Collection.filterDate(preStart, preEnd)
  .map(maskL8sr).median();

var l8Post = l8Collection.filterDate(postStart, postEnd)
  .map(maskL8sr).median();

// Landsat 8 SR bands: SR_B5 = NIR, SR_B4 = Red
var l8dNDVI = l8Pre.normalizedDifference(['SR_B5', 'SR_B4'])
  .subtract(l8Post.normalizedDifference(['SR_B5', 'SR_B4']))
  .rename('dNDVI')
  .updateMask(landMask);

// =========================================================================
// COMMON 30 m GRID + SEVERITY CLASSIFICATION
// =========================================================================

function classifySeverity(dndvi) {
  return ee.Image(0)                                // Unburned/no change
    .where(dndvi.gte(0.10).and(dndvi.lt(0.25)), 1)  // Low
    .where(dndvi.gte(0.25).and(dndvi.lt(0.50)), 2)  // Moderate
    .where(dndvi.gte(0.50), 3);                     // High
}

// Reproject Sentinel-2 dNDVI onto the Landsat 30 m grid before classifying,
// so both sensors are compared on identical pixels. The target grid must
// come from a raw Landsat scene (native 30 m), not the composite, which
// has no reliable default projection of its own.
var l8NativeProjection = l8Collection.first().select('SR_B4').projection();
l8dNDVI = l8dNDVI.setDefaultProjection(l8NativeProjection);

var s2dNDVI_30m = s2dNDVI.reproject(l8NativeProjection)
  .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 65})
  .reproject(l8NativeProjection);

var s2Severity = classifySeverity(s2dNDVI_30m).rename('Sentinel_Class').clip(aoi);
var l8Severity = classifySeverity(l8dNDVI).rename('Landsat_Class').clip(aoi);

// =========================================================================
// AGREEMENT / ACCURACY ASSESSMENT
// =========================================================================

var combined = s2Severity.addBands(l8Severity);

var samplePoints = combined.stratifiedSample({
  numPoints: 300,
  classBand: 'Sentinel_Class',
  region: aoi,
  scale: 30,
  geometries: true
});

// This compares two optical classifications against each other, not against
// ground truth - it measures inter-sensor agreement, not correctness.
// errorMatrix() just needs one band as the row axis; Landsat is used here.
var errorMatrix = samplePoints.errorMatrix('Landsat_Class', 'Sentinel_Class');

print('==================================================');
print('  SENTINEL-2 vs LANDSAT 8 BURN SEVERITY AGREEMENT  ');
print('==================================================');
print('Confusion Matrix:', errorMatrix.array());
print('Overall Agreement (%):', errorMatrix.accuracy().multiply(100));
print('Producer\'s Accuracy [Low, Moderate, High] (%):', errorMatrix.producersAccuracy().multiply(100));
print('Consumer\'s Accuracy [Low, Moderate, High] (%):', errorMatrix.consumersAccuracy().multiply(100));
print('Kappa Coefficient:', errorMatrix.kappa());

// =========================================================================
// VISUALIZATION
// =========================================================================

var severityPalette = ['#ffff00', '#ff9900', '#ff0000'];

// s2Severity/l8Severity now carry class 0 everywhere (needed so the error
// matrix can see omission error, not just pixels Sentinel already flagged
// as burned) - mask it back out only for display, so the map still shows
// classified burn areas rather than a flat class-0 overlay.
Map.addLayer(s2Severity.updateMask(s2Severity.gt(0)), {min: 1, max: 3, palette: severityPalette}, 'Sentinel-2 Severity (30 m grid)');
Map.addLayer(l8Severity.updateMask(l8Severity.gt(0)), {min: 1, max: 3, palette: severityPalette}, 'Landsat 8 Severity (30 m grid)');
Map.addLayer(samplePoints, {color: 'blue'}, 'Validation Sample Points', false);
