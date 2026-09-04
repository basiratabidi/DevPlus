import PDFDocument from 'pdfkit';

/**
 * Builds a PDF summary of a user's recent activity (task logs, incidents,
 * blockers, deployments) and returns it as a Buffer.
 */
export function buildHistoryPdf({ userName, days, history }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('DevPulse Activity Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#555').text(
      `${userName} - last ${days} days - generated ${new Date().toLocaleString()}`,
      { align: 'center' }
    );
    doc.moveDown(1.5);
    doc.fillColor('#000');

    const section = (title, items, renderLine) => {
      doc.fontSize(14).text(title, { underline: true });
      doc.moveDown(0.3);
      if (!items || items.length === 0) {
        doc.fontSize(10).fillColor('#777').text('None recorded.');
        doc.fillColor('#000');
      } else {
        items.forEach((item) => {
          doc.fontSize(10).text(renderLine(item));
        });
      }
      doc.moveDown(1);
    };

    section('Task Updates', history.taskLogs, (t) =>
      `- ${new Date(t.logged_at).toLocaleDateString()}: ${t.summary}${t.task_ref ? ` (${t.task_ref})` : ''}`
    );

    section('Incidents', history.incidents, (i) =>
      `- [${i.severity}] ${i.title} - ${i.status} (${new Date(i.reported_at).toLocaleDateString()})`
    );

    section('Blockers', history.blockers, (b) =>
      `- [${b.severity}] ${b.description} - ${b.status} (${new Date(b.reported_at).toLocaleDateString()})`
    );

    section('Deployments', history.deployments, (d) =>
      `- ${d.service_name} -> ${d.environment} - ${d.status}`
    );

    doc.end();
  });
}