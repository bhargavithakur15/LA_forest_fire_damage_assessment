// =========================================================================
// OPERATIONAL WORKFLOW: LA 2025 WILDFIRE ASSESSMENT WITH DYNAMIC CHARTING
// =========================================================================

// 1. Define Area of Interest (AOI) - Los Angeles County Region
var aoi = ee.Geometry.Polygon([
  [[-118.70, 34.20], [-118.70, 34.00], [-118.00, 34.00], [-118.00, 34.20]]
]);
Map.centerObject(aoi, 11);

// 2. Define Temporal Windows (Pre-fire vs Post-fire)
var preStart = '2024-11-01';
var preEnd   = '2024-12-25'; 
var postStart = '2025-02-01';
var postEnd   = '2025-02-28'; 

// 3. Cloud Masking Function for Sentinel-2 QA band
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000)
              .copyProperties(image, ["system:time_start"]);
}

// 4. Load and Pre-process Imagery Collections
var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');

var preFireImg = s2Collection
  .filterBounds(aoi)
  .filterDate(preStart, preEnd)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(maskS2clouds)
  .median()
  .clip(aoi);

var postFireImg = s2Collection
  .filterBounds(aoi)
  .filterDate(postStart, postEnd)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(maskS2clouds)
  .median()
  .clip(aoi);

// 5. Calculate Normalized Burn Ratio (NBR) Mosaics
var preNBR = preFireImg.normalizedDifference(['B8', 'B12']).rename('preNBR');
var postNBR = postFireImg.normalizedDifference(['B8', 'B12']).rename('postNBR');

// 6. Calculate Differenced NBR (dNBR)
var dNBR = preNBR.subtract(postNBR).rename('dNBR');

// 7. Classify Burn Severity (USGS Standard Thresholds)
var severity = ee.Image(0)
  .where(dNBR.gte(0.10).and(dNBR.lt(0.27)), 1)  // Low Severity
  .where(dNBR.gte(0.27).and(dNBR.lt(0.66)), 2)  // Moderate Severity
  .where(dNBR.gte(0.66), 3)                     // High Severity
  .updateMask(dNBR.gte(0.10))                   
  .clip(aoi);

// 8. Visualization Parameters
var rgbVis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3};
var falseColorVis = {bands: ['B12', 'B8', 'B4'], min: 0, max: 0.4}; 
var severityPalette = ['#00ff00', '#ffff00', '#ff9900', '#ff0000']; 

// 9. Add Layers to Map
Map.addLayer(preFireImg, rgbVis, 'Pre-Fire True Color');
Map.addLayer(postFireImg, falseColorVis, 'Post-Fire False Color');
Map.addLayer(dNBR, {min: -0.1, max: 0.8, palette: ['white', 'black']}, 'Continuous dNBR');
Map.addLayer(severity, {min: 0, max: 3, palette: severityPalette}, 'Burn Severity');

// =========================================================================
// NEW: DYNAMIC TIME-SERIES NBR GRAPH MODULE
// =========================================================================

// A. Map NBR calculation over the entire raw series timeline (Nov 2024 to Mar 2025)
var nbrTimeSeries = s2Collection
  .filterBounds(aoi)
  .filterDate('2024-11-01', '2025-03-15')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(maskS2clouds)
  .map(function(img) {
    var nbr = img.normalizedDifference(['B8', 'B12']).rename('NBR');
    return img.addBands(nbr).select('NBR');
  });

// B. Setup a User Interface Panel to hold the chart on screen
var panel = ui.Panel();
panel.style().set({width: '400px', position: 'bottom-right'});
Map.add(panel);

// C. Register a map click event helper to generate a dynamic spot query chart
Map.style().set('cursor', 'crosshair');

Map.onClick(function(coords) {
  panel.clear(); // Wipe the old graph
  
  var clickedPoint = ee.Geometry.Point([coords.lon, coords.lat]);
  
  // Create visual dot asset indicator where clicked
  var dot = ui.Map.Layer(clickedPoint, {color: 'blue'}, 'Clicked Target Pixel');
  Map.layers().set(4, dot); // Anchor directly over the layer stack
  
  // Generate the Chart Object
  var nbrChart = ui.Chart.image.series({
    imageCollection: nbrTimeSeries,
    region: clickedPoint,
    reducer: ee.Reducer.first(), // Pull individual center pixel
    scale: 20,
    xProperty: 'system:time_start'
  })
  .setOptions({
    title: 'NBR Temporal Trajectory (Pixel Level)',
    vAxis: {title: 'NBR Value (-1 to 1)', minValue: -0.4, maxValue: 0.8},
    hAxis: {title: 'Date Grid'},
    lineWidth: 2,
    pointSize: 5,
    series: {0: {color: 'crimson'}}
  });
  
  panel.add(ui.Label('Generating chart for coordinates: ' + coords.lon.toFixed(4) + ', ' + coords.lat.toFixed(4)));
  panel.add(nbrChart);
});
