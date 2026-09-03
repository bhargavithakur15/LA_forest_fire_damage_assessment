// =========================================================================
// FINAL COMPLETED VALIDATION SCRIPT
// =========================================================================

Map.centerObject(accurate_zone, 13);

var preStart = '2024-11-01', preEnd = '2024-12-25'; 
var postStart = '2025-02-01', postEnd = '2025-02-28'; 

function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
  return image.updateMask(mask).divide(10000).copyProperties(image, ["system:time_start"]);
}

var preFireImg = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(accurate_zone).filterDate(preStart, preEnd).map(maskS2clouds).median();
var postFireImg = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(accurate_zone).filterDate(postStart, postEnd).map(maskS2clouds).median();

// 1. SIGNAL PROCESSING
var dNDVI = preFireImg.normalizedDifference(['B8', 'B4']).subtract(postFireImg.normalizedDifference(['B8', 'B4']));
var kernel = ee.Kernel.circle({radius: 30, units: 'meters'});
var dNDVI_smooth = dNDVI.focalMean({kernel: kernel}); 

// 2. DATA MASKING
var baerRaw = ee.Image("projects/bhargavi-first-project/assets/baer_palisades_dnbr");
var baerMask = baerRaw.divide(1000).gt(0.10); 

// 3. CLASSIFICATION
var s2Severity = ee.Image(2)
  .where(dNDVI_smooth.gte(0.2), 3) 
  .updateMask(baerMask) 
  .clip(accurate_zone)
  .rename('S2_Class');

var baerTruth = ee.Image(2)
  .where(baerRaw.divide(1000).gte(0.2), 3)
  .updateMask(baerMask)
  .clip(accurate_zone)
  .rename('BAER_Class');

// 4. MATRIX ASSESSMENT
var combined = s2Severity.addBands(baerTruth);
var validationPoints = combined.stratifiedSample({
  numPoints: 200,
  classBand: 'S2_Class',
  region: accurate_zone,
  scale: 20,
  geometries: true
});

var errorMatrix = validationPoints.errorMatrix('BAER_Class', 'S2_Class', [2, 3]);

// 5. SAFE FINAL REPORT
var acc = errorMatrix.accuracy().multiply(100);
var prodAcc = errorMatrix.producersAccuracy().multiply(100);
var consAcc = errorMatrix.consumersAccuracy().multiply(100);

print('==================================================================');
print('📊 FINAL VALIDATED ACCURACY REPORT');
print('==================================================================');
print('✅ HONEST OVERALL ACCURACY (%):', acc.getInfo());
print('🎯 Producer Accuracy [Mod, High]:', prodAcc.getInfo());
print('🛡️ Consumer Accuracy [Mod, High]:', consAcc.getInfo());
print('==================================================================');

// 6. VISUALIZATION
Map.addLayer(s2Severity, {min: 2, max: 3, palette: ['#ff9900', '#ff0000']}, 'Final Model Output');
Map.addLayer(baerTruth, {min: 2, max: 3, palette: ['#ffcc66', '#990000']}, 'BAER Ground Truth', false);