import PDFDocument from 'pdfkit';

/**
 * Builds a PDF listing of a user's currently open blockers and returns
 * it as a Buffer.
 */
export function buildBlockersPdf({ userName, blockers }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('DevPulse Open Blockers', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#555').text(
      `${userName} - generated ${new Date().toLocaleString()}`,
      { align: 'center' }
    );
    doc.moveDown(1.5);
    doc.fillColor('#000');

    if (!blockers || blockers.length === 0) {
      doc.fontSize(11).fillColor('#777').text('No open blockers.');
    } else {
      blockers.forEach((b) => {
        doc.fontSize(12).fillColor('#000').text(`[${b.severity.toUpperCase()}] ${b.description}`);
        doc.fontSize(9).fillColor('#777').text(
          `Reported ${new Date(b.reported_at).toLocaleDateString()}`
        );
        doc.moveDown(0.7);
      });
    }

    doc.end();
  });
}
