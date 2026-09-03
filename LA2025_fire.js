// =========================================================================
// FINAL ADVANCED WORKFLOW: LA 2025 WILDFIRE DAMAGE ASSESSMENT
// Fully Cast Server-Side Mathematics for Reliable GEE Execution
// =========================================================================

// 1. Define Area of Interest (AOI) - Santa Monica & San Gabriel Mountain Fronts
var aoi = ee.Geometry.Polygon([
  [[-118.75, 34.35], [-118.75, 33.95], [-118.05, 33.95], [-118.05, 34.35]]
]);
Map.centerObject(aoi, 10);

// 2. Define Temporal Windows (Pre-fire vs Post-fire LA 2025)
var preStart = '2024-11-01';
var preEnd   = '2024-12-25'; 
var postStart = '2025-02-01';
var postEnd   = '2025-02-28'; 

// =========================================================================
// CORRECTION PIPELINE COMPONENTS (STRICT EE MATHEMATICS)
// =========================================================================

// A. Sentinel-2 Cloud and Cirrus Masking
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000)
              .copyProperties(image, image.propertyNames());
}

// B. BRDF Normalization (Fixed Type Implementations)
function brdfNormalize(image) {
  var fiso = {B4: 0.1690, B8: 0.2413, B12: 0.1154};
  var fvol = {B4: 0.0574, B8: 0.1017, B12: 0.0453};
  
  // Explicitly cast metadata elements into strict server-side numbers
  var vZen = ee.Image.constant(ee.Number(image.get('MEAN_INCIDENCE_ZENITH_ANGLE_B8')).multiply(Math.PI / 180));
  var sZen = ee.Image.constant(ee.Number(image.get('MEAN_SOLAR_ZENITH_ANGLE')).multiply(Math.PI / 180));
  var sAz  = ee.Number(image.get('MEAN_SOLAR_AZIMUTH_ANGLE'));
  var vAz  = ee.Number(image.get('MEAN_INCIDENCE_AZIMUTH_ANGLE_B8'));
  var relAz = ee.Image.constant(sAz.subtract(vAz).multiply(Math.PI / 180));

  var sZenTarget = ee.Image.constant(45.0 * Math.PI / 180);
  var vZenTarget = ee.Image.constant(0.0);
  var relAzTarget = ee.Image.constant(0.0);

  var calculateKernels = function(sz, vz, ra) {
    var cosPhase = sz.cos().multiply(vz.cos()).add(sz.sin().multiply(vz.sin()).multiply(ra.cos()));
    var phase = cosPhase.acos();
    var volNum = ee.Image.constant(Math.PI / 2).subtract(phase).multiply(cosPhase).add(phase.sin());
    var volDen = sz.cos().add(vz.cos());
    var vol = volNum.divide(volDen).subtract(ee.Image.constant(Math.PI / 4));
    return {vol: vol};
  };

  var bands = ['B4', 'B8', 'B12'];
  var brdfCorrected = bands.map(function(b) {
    var kUncorrected = calculateKernels(sZen, vZen, relAz);
    var kTarget = calculateKernels(sZenTarget, vZenTarget, relAzTarget);
    
    var modelUncorrected = ee.Image.constant(fiso[b]).add(ee.Image.constant(fvol[b]).multiply(kUncorrected.vol));
    var modelTarget = ee.Image.constant(fiso[b]).add(ee.Image.constant(fvol[b]).multiply(kTarget.vol));
      
    return image.select(b).multiply(modelTarget).divide(modelUncorrected).rename(b);
  });

  return image.addBands(ee.Image(brdfCorrected), null, true);
}

// C. Resilient Terrain Illumination Correction (Fixed Type Implementations)
function terrainCorrection(image) {
  var dem = ee.Image('USGS/SRTMGL1_003'); 
  
  // Explicitly cast solar angles to prevent Image-vs-Number conversion conflicts
  var solarAzimuth = ee.Number(image.get('MEAN_SOLAR_AZIMUTH_ANGLE'));
  var solarZenith = ee.Number(image.get('MEAN_SOLAR_ZENITH_ANGLE'));
  
  var terrain = ee.Terrain.products(dem);
  var slope = terrain.select('slope').multiply(Math.PI / 180);
  var aspect = terrain.select('aspect').multiply(Math.PI / 180);
  
  var zenithRad = ee.Image.constant(solarZenith.multiply(Math.PI / 180));
  var azimuthRad = ee.Image.constant(solarAzimuth.multiply(Math.PI / 180));
  
  var cosZ = zenithRad.cos();
  var sinZ = zenithRad.sin();
  var cosS = slope.cos();
  var sinS = slope.sin();
  
  var cosFi = azimuthRad.subtract(aspect).cos();
  var il = cosZ.multiply(cosS).add(sinZ.multiply(sinS).multiply(cosFi));
  
  var cFactors = {B4: 0.075, B8: 0.095, B12: 0.045};
  var bands = ['B4', 'B8', 'B12'];
  
  var correctedBands = bands.map(function(bandName) {
    var band = image.select(bandName);
    var cFactor = ee.Image.constant(cFactors[bandName]);
    
    // Explicit server-side formulas replacing native JS operations (*, /)
    var numerator = cosS.multiply(cosZ).add(cFactor);
    var denominator = il.add(cFactor);
    var corrected = band.multiply(numerator).divide(denominator);
    return corrected.rename(bandName);
  });
  
  return image.addBands(ee.Image(correctedBands), null, true);
}

// D. Master Imagery Pipeline Wrapper
function applyAdvancedCorrection(collection, start, end) {
  return collection
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
    .map(maskS2clouds)
    .map(brdfNormalize)
    .map(terrainCorrection)
    .median() 
    .clip(aoi);
}

// =========================================================================
// DATA EXECUTION PIPELINE
// =========================================================================

var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');

var preFireImg  = applyAdvancedCorrection(s2Collection, preStart, preEnd);
var postFireImg = applyAdvancedCorrection(s2Collection, postStart, postEnd);

// =========================================================================
// INDEX CALCULATIONS & VISUALIZATION
// =========================================================================

var preNBR = preFireImg.normalizedDifference(['B8', 'B12']).rename('preNBR');
var postNBR = postFireImg.normalizedDifference(['B8', 'B12']).rename('postNBR');

var dNBR = preNBR.subtract(postNBR).rename('dNBR');

var severity = ee.Image(0)
  .where(dNBR.gte(0.10).and(dNBR.lt(0.27)), 1)  // Low Severity
  .where(dNBR.gte(0.27).and(dNBR.lt(0.66)), 2)  // Moderate Severity
  .where(dNBR.gte(0.66), 3)                     // High Severity
  .updateMask(dNBR.gte(0.10))                   
  .clip(aoi);

var terrainProd = ee.Terrain.products(ee.Image('USGS/SRTMGL1_003'));
var hillshade = terrainProd.select('hillshade');
var severityPalette = ['#ffff00', '#ff9900', '#ff0000']; 

Map.addLayer(hillshade, {min: 150, max: 255}, 'Topographic Hillshade', true, 0.4);
Map.addLayer(preFireImg, {bands: ['B4', 'B8', 'B12'], min: 0, max: 0.25}, 'Pre-Fire Corrected Mosaic');
Map.addLayer(postFireImg, {bands: ['B12', 'B8', 'B4'], min: 0, max: 0.35}, 'Post-Fire Corrected False Color');
Map.addLayer(dNBR, {min: -0.1, max: 0.7, palette: ['white', 'black']}, 'Advanced dNBR Map', false);
Map.addLayer(severity, {min: 1, max: 3, palette: severityPalette}, 'Terrain-Corrected Burn Severity');

// =========================================================================
// REGIONAL REDUCER (ACREAGE COUNTER)
// =========================================================================

var areaStats = severity.gt(0)
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi,
    scale: 20,
    maxPixels: 1e9
  });

var burnedAcres = ee.Number(areaStats.values().get(0)).multiply(0.000247105); 
print('Total Advanced Pipeline Burn Estimate (Acres):', burnedAcres);
