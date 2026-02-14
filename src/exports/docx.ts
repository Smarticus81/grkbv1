import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  ImageRun,
  AlignmentType,
  BorderStyle,
} from "docx";
import type { TrendResult, BenefitRiskNarrative } from "../shared/types.js";

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 1 },
  bottom: { style: BorderStyle.SINGLE, size: 1 },
  left: { style: BorderStyle.SINGLE, size: 1 },
  right: { style: BorderStyle.SINGLE, size: 1 },
};

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: tableBorders,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 20, font: "Arial" })],
      }),
    ],
  });
}

function cell(text: string): TableCell {
  return new TableCell({
    borders: tableBorders,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, font: "Arial" })],
      }),
    ],
  });
}

/**
 * Render trend_appendix.docx
 */
export async function renderTrendAppendix(
  trendResult: TrendResult,
  chartImage: Buffer,
  deviceName: string,
  periodStart: string,
  periodEnd: string
): Promise<Buffer> {
  const sections = [];

  // Title
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: "Statistical Trend Analysis Appendix",
          bold: true,
          size: 32,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Device: ${deviceName} | Period: ${periodStart} to ${periodEnd}`,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({ children: [] })
  );

  // Input summary table
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({ text: "Input Summary", bold: true, size: 26, font: "Arial" }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("Parameter"), headerCell("Value")],
        }),
        new TableRow({
          children: [
            cell("Total Monthly Periods"),
            cell(String(trendResult.monthlySeries.length)),
          ],
        }),
        new TableRow({
          children: [
            cell("Total Complaints"),
            cell(
              String(
                trendResult.monthlySeries.reduce((s, dp) => s + dp.complaints, 0)
              )
            ),
          ],
        }),
        new TableRow({
          children: [
            cell("Total Units Sold"),
            cell(
              String(
                trendResult.monthlySeries.reduce((s, dp) => s + dp.unitsSold, 0)
              )
            ),
          ],
        }),
        new TableRow({
          children: [cell("Normalization"), cell("Per 1,000 units")],
        }),
      ],
    }),
    new Paragraph({ children: [] })
  );

  // Monthly rates table
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: "Monthly Complaint Rates",
          bold: true,
          size: 26,
          font: "Arial",
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            headerCell("Period"),
            headerCell("Complaints"),
            headerCell("Units Sold"),
            headerCell("Rate (per 1,000)"),
          ],
        }),
        ...trendResult.monthlySeries.map(
          (dp) =>
            new TableRow({
              children: [
                cell(dp.period),
                cell(String(dp.complaints)),
                cell(String(dp.unitsSold)),
                cell(dp.rate.toFixed(4)),
              ],
            })
        ),
      ],
    }),
    new Paragraph({ children: [] })
  );

  // Statistical summary table
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: "Statistical Summary",
          bold: true,
          size: 26,
          font: "Arial",
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell("Statistic"), headerCell("Value")],
        }),
        new TableRow({
          children: [cell("Mean Rate"), cell(trendResult.mean.toFixed(4))],
        }),
        new TableRow({
          children: [
            cell("Standard Deviation"),
            cell(trendResult.stdDev.toFixed(4)),
          ],
        }),
        new TableRow({
          children: [cell("UCL (3-sigma)"), cell(trendResult.ucl.toFixed(4))],
        }),
        new TableRow({
          children: [
            cell("Western Electric Violations"),
            cell(String(trendResult.westernElectricViolations.length)),
          ],
        }),
      ],
    }),
    new Paragraph({ children: [] })
  );

  // Trend determination
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: "Trend Determination",
          bold: true,
          size: 26,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Determination: ${trendResult.determination}`,
          bold: true,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: trendResult.justification,
          size: 20,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({ children: [] })
  );

  // Chart image
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: "Trend Chart",
          bold: true,
          size: 26,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: chartImage,
          transformation: { width: 600, height: 300 },
          type: "png",
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [{ children: sections }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

/**
 * Render benefit_risk_section.docx
 */
export async function renderBenefitRiskDocx(
  narrative: BenefitRiskNarrative,
  deviceName: string,
  periodStart: string,
  periodEnd: string
): Promise<Buffer> {
  const sections = [];

  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: "Benefit–Risk Determination",
          bold: true,
          size: 32,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Device: ${deviceName} | Period: ${periodStart} to ${periodEnd}`,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({ children: [] })
  );

  const addSection = (heading: string, text: string) => {
    sections.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({ text: heading, bold: true, size: 26, font: "Arial" }),
        ],
      })
    );
    for (const para of text.split("\n").filter((p) => p.trim())) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({ text: para.trim(), size: 20, font: "Arial" }),
          ],
        })
      );
    }
    sections.push(new Paragraph({ children: [] }));
  };

  addSection("Period Statement", narrative.periodStatement);
  addSection("Trend Summary", narrative.trendSummary);
  addSection("CAPA Impact", narrative.capaImpact);
  addSection("Risk Summary Delta", narrative.riskSummaryDelta);
  addSection("Conclusion", narrative.conclusion);

  // Limitations
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: "Limitations",
          bold: true,
          size: 26,
          font: "Arial",
        }),
      ],
    })
  );
  if (narrative.limitations.length > 0) {
    for (const lim of narrative.limitations) {
      sections.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: lim, size: 20, font: "Arial" }),
          ],
        })
      );
    }
  } else {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "No significant limitations identified.",
            size: 20,
            font: "Arial",
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [{ children: sections }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
