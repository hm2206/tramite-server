'use strict'

const { PDFDocument, StandardFonts, rgb, PageSizes } = require('pdf-lib');

class TicketController {

    handle = async ({ request, response }) => {
        const pdfDoc = await PDFDocument.create({
            
        })

        const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)

        //  297×210
        const page = pdfDoc.addPage([83.4, 438.8]);
        const { width, height } = page.getSize()
        const fontSize = 13
        page.drawText('Creating PDFs in JavaScript is awesome!', {
            x: 0,
            y: height - 4 * fontSize,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0, 0.53, 0.71),
        })

        const pdfBytes = Buffer.from(await pdfDoc.save());
        response.header('Content-Type', 'application/pdf');
        return response.send(pdfBytes);
    }

}

module.exports = TicketController
