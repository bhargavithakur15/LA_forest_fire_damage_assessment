// Import landsat imagery. Create function to cloud mask from 
// the pixel_qa band of Landsat 8 SR data. 
// Bits 3 and 5 are cloud shadow and cloud, respectively.

var imageCollection = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(studyArea);

function maskL8sr(imageCollection) {
  var cloudShadowBitMask = 1 << 3;
  var cloudsBitMask = 1 << 5;

  var qa = imageCollection.select('QA_PIXEL');

  var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
      .and(qa.bitwiseAnd(cloudsBitMask).eq(0));

  return imageCollection.updateMask(mask).multiply(0.0000275).add(-0.2)
      .select("SR_B[0-9]*")
      .copyProperties(imageCollection, ["system:time_start"]);
}

// Make a list of years, then for each year filter the collection, 
// mask clouds, and reduce by median. Important to add system:time_start 
// after reducing as this allows you to filter by date later.
var stepList = ee.List.sequence(2014,2020);

var filterCollection = stepList.map(function(year){
  var startDate = ee.Date.fromYMD(year,5,1);
  var endDate = ee.Date.fromYMD(year,9,15);
  var composite_i = imageCollection.filterDate(startDate, endDate)
                        .map(maskL8sr)
                        .median()
                        .set('system:time_start',startDate);
  return composite_i;
});

var yearlyComposites = ee.ImageCollection(filterCollection);
print(yearlyComposites, 'Masked and Filtered Composites');

// // Add Enhanced Vegetation Index to a function and apply it.
// // EVI = 2.5 * ((NIR - Red) / (NIR + 6 * Red – 7.5 * Blue + 1))
function evi(img){
  var eviImg = img.select(['SR_B5','SR_B4','SR_B2'],['nir','red','blue']);
  eviImg = eviImg.expression(
    '(2.5 * ((NIR - RED)) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': eviImg.select('nir'),
      'RED': eviImg.select('red'),
      'BLUE': eviImg.select('blue')
    }).rename('EVI');
  return img.addBands(eviImg);
}

yearlyComposites = yearlyComposites.map(function(image){
  return evi(image);
});

print(yearlyComposites, 'With EVI as Band');

// Create image collection of yearly composites, selecting the EVI band.
var eviCollection = yearlyComposites.select('EVI');

// Create variables for each yearly composite.
// Add the 7 EVI maps for each year 2014-2020.
var y2014 = eviCollection.filterDate('2014-01-01','2014-12-31')
  .first()
  .clip(studyArea);
  
var y2015 = eviCollection.filterDate('2015-01-01','2015-12-31')
  .first()
  .clip(studyArea);
  
var y2016 = eviCollection.filterDate('2016-01-01','2016-12-31')
  .first()
  .clip(studyArea);
  
var y2017 = eviCollection.filterDate('2017-01-01','2017-12-31')
  .first()
  .clip(studyArea);
  
var y2018 = eviCollection.filterDate('2018-01-01','2018-12-31')
  .first()
  .clip(studyArea);

var y2019 = eviCollection.filterDate('2019-01-01','2019-12-31')
  .first()
  .clip(studyArea);

var y2020 = eviCollection.filterDate('2020-01-01','2020-12-31')
  .first()
  .clip(studyArea);
  
print(y2020, '2020 Composite Image');
  
var eviParams = {min: 0, max: 1, palette: ['white', 'green']};

Map.addLayer(y2014, eviParams, '2014 EVI');
Map.addLayer(y2015, eviParams, '2015 EVI');
Map.addLayer(y2016, eviParams, '2016 EVI');
Map.addLayer(y2017, eviParams, '2017 EVI');
Map.addLayer(y2018, eviParams, '2018 EVI');
Map.addLayer(y2019, eviParams, '2019 EVI');
Map.addLayer(y2020, eviParams, '2020 EVI');

//Export map to Drive.
var y2014section = eviCollection.filterDate('2014-01-01','2014-12-31')
  .first()
  .clip(section);

Export.image.toDrive({
  image: y2014section,
  description: '2014_EVI_Export',
  scale: 30,
  maxPixels: 1000000000,
});

// Create a line chart to display EVI time series for a selected point.
// Display chart in the console.
var chart = ui.Chart.image.series({
  imageCollection: eviCollection.select('EVI'),
  region: roi,
  scale: 30
}).setOptions({title: 'Point 1: EVI Over Time'});

print(chart);

var chart2 = ui.Chart.image.series({
  imageCollection: eviCollection.select('EVI'),
  region: roi2,
  scale: 30
}).setOptions({title: 'Point 2: EVI Over Time'});

print(chart2);

// Creating a Timeseries GIF of EVI maps.

// Load package from Gena for adding text annotations. 
var text = require('users/gena/packages:text');

// Create year property.
var yearNames = ee.List([ '2014', '2015', '2016','2017',
                          '2018','2019','2020']);
var eviWithYear = eviCollection.map(function(feat){
  return feat.set('year', yearNames.getString(
                      ee.Number.parse(feat.getString('system:index'))));
});

print(eviWithYear, 'year');

// Define GIF visualization arguments.
var gifParams = {
  'region': studyArea,
  'dimensions': 800,
  'framesPerSecond': 2,
  'format': 'gif'
};

//Labeling your images.
var annotations = [{
  position: 'bottom',
  offset: '10%',
  margin: '20%',
  property: 'year',
  scale: 6000
  }];
  
// Mapping over the collection to annotate each image.
// Note that the "annotateImage" is a function written by Gena
var timeSeriesgif = eviWithYear.map(function(image) {
  return text.annotateImage(image, eviParams, studyArea, annotations);
});

// Print the GIF URL to the console
print(timeSeriesgif.getVideoThumbURL(gifParams));

// Render the GIF animation in the console.
print(ui.Thumbnail(timeSeriesgif, gifParams));

// Simple image differencing between 2014 and 2020.
var SimpleImageDiff = y2014.subtract(y2020);

var diffParams = {min: -1, max: 1, palette: ['green', 'yellow', 'red']};
Map.addLayer(SimpleImageDiff, diffParams, '2014/2020 Image Difference');

// 2020 difference from mean EVI values.
var yMean = eviCollection.mean();
var AvgImageDiff = yMean.subtract(y2020);

Map.addLayer(AvgImageDiff, diffParams, '2020 Difference from Average');

// Standard Anomalies (Z-Score). Calculate Standard Deviation across the EVI collection.
// Z-Score = (Year-Mean)/Standard Deviation
var stdImg = eviCollection.reduce(ee.Reducer.stdDev());
var Anomaly2020 = y2020.subtract(yMean).divide(stdImg);
var Anomaly2018 = y2018.subtract(yMean).divide(stdImg);
var Anomaly2016 = y2016.subtract(yMean).divide(stdImg);
var Anomaly2014 = y2014.subtract(yMean).divide(stdImg);

var anomParams = {min: -3, max:3, palette: ['red', 'yellow', 'green']};
Map.addLayer(Anomaly2020, anomParams, '2020 Anomaly');
Map.addLayer(Anomaly2018, anomParams, '2018 Anomaly');
Map.addLayer(Anomaly2016, anomParams, '2016 Anomaly');
Map.addLayer(Anomaly2014, anomParams, '2014 Anomaly');
  
  
  