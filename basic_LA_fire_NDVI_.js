// =========================================================================
// OPERATIONAL WORKFLOW: DYNAMIC ASSESSMENT WITH WIDE-AREA BASELINE
// =========================================================================

// 1. Define original baseline reference coordinates (Wide Area)
var originalAOI = ee.Geometry.Polygon([
  [[-118.70, 34.20], [-118.70, 34.00], [-118.00, 34.00], [-118.00, 34.20]]
]);
Map.centerObject(originalAOI, 11);

print('INSTRUCTIONS: The wide-area baseline layer is loaded automatically. To query a specific plot, use the rectangle/polygon drawing tools at the top-left, then click the "Calculate Metrics for Drawn Area" button.');

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

// 4. Load full unclipped collections
var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');

var preFireImgFull = s2Collection
  .filterDate(preStart, preEnd)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(maskS2clouds)
  .median();

var postFireImgFull = s2Collection
  .filterDate(postStart, postEnd)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 15))
  .map(maskS2clouds)
  .median();

// 5. Generate base pre-calculated unclipped layers
var preNDVIFull = preFireImgFull.normalizedDifference(['B8', 'B4']).rename('preNDVI');
var postNDVIFull = postFireImgFull.normalizedDifference(['B8', 'B4']).rename('postNDVI');
var dNDVIFull = preNDVIFull.subtract(postNDVIFull).rename('dNDVI');

// 6. Base classification structure for severity
var severityFull = ee.Image(0)
  .where(dNDVIFull.gte(0.10).and(dNDVIFull.lt(0.25)), 1)
  .where(dNDVIFull.gte(0.25).and(dNDVIFull.lt(0.50)), 2)
  .where(dNDVIFull.gte(0.50), 3)
  .updateMask(dNDVIFull.gte(0.10));

// Visualization Settings
var rgbVis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3};
var severityPalette = ['#7ec0ee', '#ffff00', '#ff9900', '#ff0000']; 

// 7. Map permanent baseline layers clipped to original wide-area bounds
Map.addLayer(preFireImgFull.clip(originalAOI), rgbVis, 'Original Bounds Pre-Fire RGB', false);
Map.addLayer(postFireImgFull.clip(originalAOI), rgbVis, 'Original Bounds Post-Fire RGB', false);
Map.addLayer(dNDVIFull.clip(originalAOI), {min: -0.1, max: 0.6, palette: ['white', 'black']}, 'Original Bounds dNDVI (Wide Area)');
Map.addLayer(severityFull.clip(originalAOI), {min: 0, max: 3, palette: severityPalette}, 'Drawn Plot Burn Severity');


// =========================================================================
// CORE FUNCTION: RUN ANALYSIS ON DRAWN GEOMETRY
// =========================================================================

var calculateMetrics = function() {
  var layers = Map.drawingTools().layers();
  
  if (layers.length() === 0) {
    print('Error: Please draw a square or polygon on the map first using the drawing toolbar.');
    return;
  }
  
  print('Calculating metrics for your drawn zone...');
  
  var userAOI = layers.get(0).getEeObject();
  
  // Reset layers to preserve the permanent wide baseline while overlaying target data
  Map.layers().reset(); 
  Map.addLayer(dNDVIFull.clip(originalAOI), {min: -0.1, max: 0.6, palette: ['white', 'black']}, 'Original Bounds dNDVI (Wide Area)');
  Map.addLayer(preFireImgFull.clip(userAOI), rgbVis, 'Drawn Plot Pre-Fire RGB');
  Map.addLayer(postFireImgFull.clip(userAOI), rgbVis, 'Drawn Plot Post-Fire RGB');
  Map.addLayer(severityFull.clip(userAOI), {min: 0, max: 3, palette: severityPalette}, 'Drawn Plot Burn Severity');
  
  // --- Calculate Metrics ---
  var totalAreaAcres = ee.Number(userAOI.area(1).divide(4046.85642));
  var cellArea = ee.Image.pixelArea().divide(4046.85642);
  var clippedSeverity = severityFull.clip(userAOI);
  
  var areaTotals = cellArea.addBands(clippedSeverity).reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class',
    }),
    geometry: userAOI,
    scale: 10,
    maxPixels: 1e9
  });
  
  var statsList = ee.List(areaTotals.get('groups'));
  var totalBurnedAcres = statsList.map(function(item) {
    return ee.Dictionary(item).get('sum');
  }).reduce(ee.Reducer.sum());
  
  print('==================================================');
  print('  DYNAMIC GEOMETRY ASSESSMENT RESULTS             ');
  print('==================================================');
  
  totalAreaAcres.evaluate(function(val) { 
    if (val !== null && val !== undefined) print('Drawn Boundary Total Area: ' + val.toFixed(1) + ' Acres'); 
  });
  
  totalBurnedAcres.evaluate(function(val) { 
    if (val !== null && val !== undefined) print('Total Truly Impacted Burned Area: ' + val.toFixed(1) + ' Acres'); 
  });
  
  statsList.evaluate(function(successList) {
    if (!successList || successList.length === 0) {
      print('No burned pixels detected within the drawn zone.');
      print('==================================================');
      return;
    }
    
    var classNames = {
      1: "Low Vegetation Loss",
      2: "Moderate Vegetation Loss",
      3: "High Vegetation Loss"
    };
    
    var totalAreaInfo = totalAreaAcres.getInfo();
    
    successList.forEach(function(row) {
      var classId = row.class;
      var classAcres = row.sum;
      if (classAcres !== null && classAcres !== undefined && totalAreaInfo) {
        var pctOfTotal = (classAcres / totalAreaInfo) * 100;
        print(' -> ' + classNames[classId] + ': ' + classAcres.toFixed(1) + ' Acres (' + pctOfTotal.toFixed(2) + '%)');
      }
    });
    print('==================================================');
  });
};


// =========================================================================
// INTERFACE SECTOR: CREATE RUN BUTTON AND STATIC LEGEND
// =========================================================================

var runButton = ui.Button({
  label: '⚡ Calculate Metrics for Drawn Area',
  onClick: calculateMetrics,
  style: {position: 'top-center', padding: '4px'}
});
Map.add(runButton);

var legend = ui.Panel({style: {position: 'bottom-left', padding: '8px 15px', backgroundColor: 'white'}});
var legendTitle = ui.Label({value: 'Vegetation Loss (dNDVI)', style: {fontWeight: 'bold', fontSize: '15px', margin: '0 0 6px 0'}});
legend.add(legendTitle);

var makeLegendRow = function(color, name) {
  var colorBox = ui.Label({style: {backgroundColor: color, padding: '8px', margin: '0 6px 4px 0'}});
  var description = ui.Label({value: name, style: {margin: '0 0 4px 6px', fontSize: '13px'}});
  return ui.Panel({widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal')});
};

var legendLabels = ['Low Loss (0.10 - 0.25)', 'Moderate Loss (0.25 - 0.50)', 'High Loss (> 0.50)'];
for (var i = 1; i < 4; i++) {
  legend.add(makeLegendRow(severityPalette[i], legendLabels[i - 1]));
}
Map.add(legend);