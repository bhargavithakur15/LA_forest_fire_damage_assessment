// =========================================================================
// CROSS-SENSOR VALIDATION: SENTINEL-2 vs LANDSAT 8 BURN SEVERITY
// Compares dNDVI-derived burn severity from both platforms on a common
// 30 m grid to estimate agreement/accuracy between sensors.
// =========================================================================

// 1. Area of Interest - Santa Monica Mountains, LA
var aoi = ee.Geometry.Polygon([
  [[-118.75, 34.35], [-118.75, 33.95], [-118.05, 33.95], [-118.05, 34.35]]
]);
Map.centerObject(aoi, 10);

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

var s2dNDVI = s2Pre.normalizedDifference(['B8', 'B4'])
  .subtract(s2Post.normalizedDifference(['B8', 'B4']))
  .rename('dNDVI');

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
  .rename('dNDVI');

// =========================================================================
// COMMON 30 m GRID + SEVERITY CLASSIFICATION
// =========================================================================

function classifySeverity(dndvi) {
  return ee.Image(0)
    .where(dndvi.gte(0.10).and(dndvi.lt(0.25)), 1)  // Low
    .where(dndvi.gte(0.25).and(dndvi.lt(0.50)), 2)  // Moderate
    .where(dndvi.gte(0.50), 3)                      // High
    .updateMask(dndvi.gte(0.10));
}

// Reproject Sentinel-2 dNDVI onto the Landsat 30 m grid before classifying,
// so both sensors are compared on identical pixels.
var l8Projection = l8dNDVI.projection();
var s2dNDVI_30m = s2dNDVI.reproject(l8Projection)
  .reduceResolution({reducer: ee.Reducer.mean(), maxPixels: 65})
  .reproject(l8Projection);

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
  geometries: true,
  dropNulls: true
});

// Treat Landsat as the reference and Sentinel-2 as the classification being tested.
var errorMatrix = samplePoints.errorMatrix('Landsat_Class', 'Sentinel_Class');

print('==================================================');
print('  SENTINEL-2 vs LANDSAT 8 BURN SEVERITY AGREEMENT  ');
print('==================================================');
print('Confusion Matrix:', errorMatrix.array());
print('Overall Accuracy (%):', errorMatrix.accuracy().multiply(100));
print('Producer\'s Accuracy [Low, Moderate, High] (%):', errorMatrix.producersAccuracy().multiply(100));
print('Consumer\'s Accuracy [Low, Moderate, High] (%):', errorMatrix.consumersAccuracy().multiply(100));
print('Kappa Coefficient:', errorMatrix.kappa());

// =========================================================================
// VISUALIZATION
// =========================================================================

var severityPalette = ['#ffff00', '#ff9900', '#ff0000'];

Map.addLayer(s2Severity, {min: 1, max: 3, palette: severityPalette}, 'Sentinel-2 Severity (30 m grid)');
Map.addLayer(l8Severity, {min: 1, max: 3, palette: severityPalette}, 'Landsat 8 Severity (30 m grid)');
Map.addLayer(samplePoints, {color: 'blue'}, 'Validation Sample Points', false);
