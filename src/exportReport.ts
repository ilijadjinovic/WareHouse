export type RepRow = { sifra: string; naziv: string; kategorija: string; jm: string; start: number; ulaz: number; izlaz: number; prenos: number; popis: number; storno: number; change: number; end: number };
export type RepMeta = { title: string; info: [string, string][]; head: string[]; footerPage: string };

const body = (rows: RepRow[]) => rows.map(r => [r.sifra, r.naziv, r.kategorija, r.jm, r.start, r.ulaz, r.izlaz, r.prenos, r.popis, r.storno, r.change, r.end]);

function download(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function exportXlsx(meta: RepMeta, rows: RepRow[], file: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Report");
  ws.addRow([meta.title]).font = { bold: true, size: 14 };
  meta.info.forEach(([k, v]) => { const r = ws.addRow([k, v]); r.getCell(1).font = { bold: true }; });
  ws.addRow([]);
  const h = ws.addRow(meta.head); h.font = { bold: true };
  h.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E9F0" } }; c.border = { bottom: { style: "thin" } }; });
  body(rows).forEach(r => ws.addRow(r));
  [14, 38, 18, 8, 12, 10, 10, 10, 18, 10, 10, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let c = 5; c <= 12; c++) ws.getColumn(c).alignment = { horizontal: "right" };
  ws.views = [{ state: "frozen", ySplit: h.number }];
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), file);
}

export async function exportPdf(meta: RepMeta, rows: RepRow[], file: string) {
  const [{ jsPDF }, at, font] = await Promise.all([import("jspdf"), import("jspdf-autotable"), import("./pdfFont")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.addFileToVFS("LS-Regular.ttf", font.regular); doc.addFont("LS-Regular.ttf", "LS", "normal");
  doc.addFileToVFS("LS-Bold.ttf", font.bold); doc.addFont("LS-Bold.ttf", "LS", "bold");
  doc.setFont("LS", "bold"); doc.setFontSize(15); doc.text(meta.title, 40, 44);
  doc.setFontSize(9); let y = 64;
  meta.info.forEach(([k, v]) => { doc.setFont("LS", "bold"); doc.text(k + ":", 40, y); doc.setFont("LS", "normal"); doc.text(v, 130, y); y += 13; });
  const num = { halign: "right" as const };
  at.default(doc, {
    startY: y + 6, head: [meta.head], body: body(rows).map(r => r.map(String)),
    styles: { font: "LS", fontSize: 8, cellPadding: 3 }, headStyles: { font: "LS", fontStyle: "bold", fillColor: [229, 233, 240], textColor: 20 },
    columnStyles: { 4: num, 5: num, 6: num, 7: num, 8: num, 9: num, 10: num, 11: { ...num, fontStyle: "bold" } },
    margin: { left: 40, right: 40, bottom: 34 },
  });
  const n = doc.getNumberOfPages(), w = doc.internal.pageSize.getWidth(), hh = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("LS", "normal"); doc.setFontSize(8); doc.text(`${meta.footerPage} ${i} / ${n}`, w - 40, hh - 18, { align: "right" }); }
  download(doc.output("blob"), file);
}
