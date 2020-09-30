const Drive = use('Drive');
const { PDFDocument } = require('pdf-lib');
const Helpers = use('Helpers')
const codeQR = require('qrcode');
const fs = require('fs');

const addQrPdf = async (filename, pdfRealPath, qrRealpath, numPage = 0, size = { width: 75, height: 75 }) => {
  let pdfRaw = await Drive.get(pdfRealPath);
  let code = await Drive.get(qrRealpath);
  const pdfDoc = await PDFDocument.load(pdfRaw);
  const pngImage = await pdfDoc.embedPng(code);
  const page = pdfDoc.getPage(numPage);
  const { width, height } = page.getSize();
  // optiones
  let options = {
    x: width - 80,
    y: height - 80,
    ...size
  };
  // add imagen a la primara pagina
  page.drawImage(pngImage, options);
  // generar pdf modificado
  const pdfBytes = await pdfDoc.save();
  // guardar
  return await Drive.put(Helpers.tmpPath(filename), Buffer.from(pdfBytes));
}


const addQrPdfEmbed = async (filename, pdfRealPath, message, numPage = 0, size = { width: 75, height: 75 }) => {
  let pdfRaw = await Drive.get(pdfRealPath);
  let code = await codeQR.toBuffer(message);
  const pdfDoc = await PDFDocument.load(pdfRaw);
  const pngImage = await pdfDoc.embedPng(code);
  const page = pdfDoc.getPage(numPage);
  const { width, height } = page.getSize();
  // optiones
  let options = {
    x: width - 80,
    y: height - 80,
    ...size
  };
  // add imagen a la primara pagina
  page.drawImage(pngImage, options);
  // generar pdf modificado
  const pdfBytes = await pdfDoc.save();
  // guardar
  let save = await Drive.put(Helpers.tmpPath(filename), Buffer.from(pdfBytes));
  // response 
  if (save) return {
    success: true,
    pdfBase: fs.readFileSync(Helpers.tmpPath(filename), 'base64'),
    path: Helpers.tmpPath(filename)
  }
  // res 
  return {
    success: false,
    pdfBase: "",
    path: ""
  }
}

module.exports = {
  addQrPdf,
  addQrPdfEmbed
};