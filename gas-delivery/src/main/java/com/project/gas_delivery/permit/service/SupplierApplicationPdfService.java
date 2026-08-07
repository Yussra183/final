package com.project.gas_delivery.permit.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Renders the supplier application form + supplier certificate PDFs.
 *
 * <p>Mirrors the layout of {@link RiderApplicationPdfService} — a single
 * A4 landscape certificate with a navy header band, a central details
 * table, a verification QR stamp, and an official approval seal; plus a
 * portrait A4 blank application form. The colour palette is reused so
 * seller, rider, and supplier documents are visually consistent.</p>
 *
 * <p>Both PDFs are generated on demand by the supplier controllers so
 * the rendered document always reflects the current user / application
 * metadata.</p>
 */
@Service
public class SupplierApplicationPdfService {

    private static final Color HEADER_BG = new Color(20, 64, 110);
    private static final Color SUBTLE_GREY = new Color(236, 240, 245);
    private static final Color SEAL_COLOR = new Color(160, 30, 30);

    /**
     * Render the supplier certificate for the supplied data payload. The
     * payload is built by
     * {@code SupplierApplicationService#buildIssuedCertificateData} from
     * the live {@code users} and {@code supplier_applications} tables.
     */
    public byte[] renderIssuedCertificate(IssuedSupplierCertificateData data) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4.rotate(), 36, 36, 36, 36);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new CertificatePageEvent(
                    safe(data.certificateNumber()),
                    "APPROVED SUPPLIER"));
            document.open();

            // ---- Header band ----------------------------------------------
            PdfPTable band = new PdfPTable(1);
            band.setWidthPercentage(100);
            PdfPCell headerCell = new PdfPCell();
            headerCell.setBackgroundColor(HEADER_BG);
            headerCell.setPadding(10);
            Paragraph title = new Paragraph(
                    "GAS SUPPLIER CERTIFICATE",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 22f, Color.WHITE));
            title.setAlignment(Element.ALIGN_CENTER);
            headerCell.addElement(title);
            Paragraph subtitle = new Paragraph(
                    "Official Authorization to Operate as a Licensed Gas Supplier",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 11f, Color.WHITE));
            subtitle.setAlignment(Element.ALIGN_CENTER);
            headerCell.addElement(subtitle);
            band.addCell(headerCell);
            document.add(band);

            // ---- Supplier name banner -------------------------------------
            document.add(centeredParagraph(
                    safe(data.fullName()).toUpperCase(),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 22f, HEADER_BG)));
            document.add(centeredParagraph(
                    "Licensed Gas Supplier",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 10f,
                            new Color(80, 90, 110))));
            document.add(space(6));

            // ---- Details grid --------------------------------------------
            PdfPTable fields = new PdfPTable(2);
            fields.setWidthPercentage(100);
            fields.setWidths(new float[]{1.2f, 2.2f});
            fields.setKeepTogether(true);
            fields.addCell(certLabelCell("Certificate No."));
            fields.addCell(certValueCell(safe(data.certificateNumber())));
            fields.addCell(certLabelCell("Approval No."));
            fields.addCell(certValueCell(safe(data.supplierReferenceNumber())));
            fields.addCell(certLabelCell("Supplier Company Name"));
            fields.addCell(certValueCell(safe(data.fullName())));
            fields.addCell(certLabelCell("Company Registration ID"));
            fields.addCell(certValueCell(safe(data.companyRegistrationId())));
            fields.addCell(certLabelCell("Email"));
            fields.addCell(certValueCell(safe(data.email())));
            fields.addCell(certLabelCell("Phone"));
            fields.addCell(certValueCell(safe(data.phone())));
            fields.addCell(certLabelCell("Approval Date"));
            fields.addCell(certValueCell(safe(data.approvalDate())));
            fields.addCell(certLabelCell("Expiry Date"));
            fields.addCell(certValueCell(safe(data.validUntilDate())));
            document.add(fields);

            // ---- QR verify block -----------------------------------------
            PdfPTable qrBlock = new PdfPTable(1);
            qrBlock.setHorizontalAlignment(Element.ALIGN_RIGHT);
            qrBlock.setWidthPercentage(18);
            qrBlock.setSpacingBefore(4f);
            qrBlock.setSpacingAfter(0f);
            qrBlock.setKeepTogether(true);
            PdfPCell qrInner = new PdfPCell();
            qrInner.setBorder(Rectangle.BOX);
            qrInner.setBorderColor(new Color(180, 188, 200));
            qrInner.setPadding(4);
            qrInner.setHorizontalAlignment(Element.ALIGN_CENTER);
            Image qrImage = buildQrImage(data);
            if (qrImage != null) {
                qrImage.scaleAbsolute(64f, 64f);
                qrInner.addElement(qrImage);
            }
            qrInner.addElement(centeredParagraph("Scan to verify",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, HEADER_BG)));
            qrBlock.addCell(qrInner);
            document.add(qrBlock);
            document.add(space(4));

            // ---- Footer (officer / seal / dates) -------------------------
            PdfPTable footer = new PdfPTable(3);
            footer.setWidthPercentage(100);
            footer.setWidths(new float[]{1.6f, 1.4f, 1.2f});

            PdfPCell sigCell = new PdfPCell();
            sigCell.setBorder(Rectangle.NO_BORDER);
            sigCell.setPadding(2);
            sigCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            String officerName = safe(data.reviewerName()).isEmpty()
                    ? "Authorized Officer"
                    : safe(data.reviewerName());
            sigCell.addElement(centeredParagraph(officerName,
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, HEADER_BG)));
            sigCell.addElement(centeredParagraph(
                    " ________________________",
                    FontFactory.getFont(FontFactory.HELVETICA, 9f, Color.DARK_GRAY)));
            sigCell.addElement(centeredParagraph(
                    "Authorised Signature · Licensing Authority",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, Color.DARK_GRAY)));
            footer.addCell(sigCell);

            PdfPCell sealCell = new PdfPCell();
            sealCell.setBorder(Rectangle.NO_BORDER);
            sealCell.setPadding(0);
            sealCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            sealCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            sealCell.addElement(buildOfficialSeal());
            footer.addCell(sealCell);

            PdfPCell dateCell = new PdfPCell();
            dateCell.setBorder(Rectangle.NO_BORDER);
            dateCell.setPadding(2);
            dateCell.setHorizontalAlignment(Element.ALIGN_CENTER);
            dateCell.addElement(centeredParagraph("Date Issued",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, Color.DARK_GRAY)));
            dateCell.addElement(centeredParagraph(safe(data.approvalDate()),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, HEADER_BG)));
            dateCell.addElement(space(3));
            dateCell.addElement(centeredParagraph("Certificate No.",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, Color.DARK_GRAY)));
            dateCell.addElement(centeredParagraph(safe(data.certificateNumber()),
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, HEADER_BG)));
            footer.addCell(dateCell);

            document.add(footer);

            // ---- Legal note ---------------------------------------------
            Paragraph note = new Paragraph(
                    "Issued under the authority of the Gas Delivery & Supplying Authority · "
                            + "Non-transferable · Must be produced on demand.",
                    FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7.5f, Color.DARK_GRAY));
            note.setAlignment(Element.ALIGN_CENTER);
            note.setSpacingBefore(2f);
            document.add(note);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not render supplier certificate: " + e.getMessage(), e);
        }
    }

    private static PdfPTable buildOfficialSeal() {
        PdfPTable seal = new PdfPTable(1);
        seal.setWidthPercentage(100);
        PdfPCell outer = new PdfPCell();
        outer.setBorder(Rectangle.BOX);
        outer.setBorderColor(SEAL_COLOR);
        outer.setBorderWidth(2.2f);
        outer.setHorizontalAlignment(Element.ALIGN_CENTER);
        outer.setVerticalAlignment(Element.ALIGN_MIDDLE);
        outer.setMinimumHeight(64f);
        outer.setPadding(2);
        outer.addElement(centeredParagraph("OFFICIAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, SEAL_COLOR)));
        outer.addElement(centeredParagraph("SUPPLIER",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, SEAL_COLOR)));
        outer.addElement(centeredParagraph("SEAL",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11f, SEAL_COLOR)));
        outer.addElement(centeredParagraph(
                "Gas Delivery & Supplying Authority",
                FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 7f, Color.GRAY)));
        seal.addCell(outer);
        return seal;
    }

    private static Image buildQrImage(IssuedSupplierCertificateData data) {
        String payload = "GasDeliverySupplierCertificate:" + safe(data.certificateNumber());
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 1);
            hints.put(EncodeHintType.ERROR_CORRECTION,
                    com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(payload, BarcodeFormat.QR_CODE, 240, 240, hints);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", png);
            return Image.getInstance(png.toByteArray());
        } catch (WriterException | IOException e) {
            return null;
        }
    }

    private static Paragraph centeredParagraph(String text, Font font) {
        Paragraph p = new Paragraph(text, font);
        p.setAlignment(Element.ALIGN_CENTER);
        return p;
    }

    private static PdfPCell certLabelCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text,
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, Color.DARK_GRAY)));
        c.setBackgroundColor(SUBTLE_GREY);
        c.setPadding(4);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(180, 188, 200));
        return c;
    }

    private static PdfPCell certValueCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text,
                FontFactory.getFont(FontFactory.HELVETICA, 10f, Color.BLACK)));
        c.setPadding(4);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(180, 188, 200));
        return c;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    /**
     * Page event that draws the decorative border and translucent
     * "APPROVED SUPPLIER" watermark on every page. Uses the
     * {@link ColumnText} path (mirrored from the rider service) so the
     * begin/end text operator counts stay balanced when OpenPDF closes
     * the document.
     */
    private static final class CertificatePageEvent extends PdfPageEventHelper {

        private final String certificateNumber;
        private final String watermarkText;

        private CertificatePageEvent(String certificateNumber, String watermarkText) {
            this.certificateNumber = certificateNumber;
            this.watermarkText = watermarkText;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            try {
                PdfContentByte canvas = writer.getDirectContentUnder();
                Rectangle page = document.getPageSize();
                float outerInset = 18f;
                float innerInset = 22f;
                Rectangle outer = new Rectangle(
                        page.getLeft() + outerInset,
                        page.getBottom() + outerInset,
                        page.getRight() - outerInset,
                        page.getTop() - outerInset);
                outer.setBorderWidth(2.4f);
                outer.setBorderColor(new Color(20, 64, 110));
                canvas.rectangle(outer);

                Rectangle inner = new Rectangle(
                        page.getLeft() + innerInset,
                        page.getBottom() + innerInset,
                        page.getRight() - innerInset,
                        page.getTop() - innerInset);
                inner.setBorderWidth(0.6f);
                inner.setBorderColor(new Color(180, 188, 200));
                canvas.rectangle(inner);

                Font watermarkFont = FontFactory.getFont(
                        FontFactory.HELVETICA_BOLD, 64f, new Color(220, 220, 230));
                Phrase phrase = new Phrase(watermarkText, watermarkFont);
                float x = (page.getLeft() + page.getRight()) / 2f;
                float y = (page.getBottom() + page.getTop()) / 2f;
                canvas.saveState();
                canvas.setColorFill(new Color(220, 220, 230));
                ColumnText.showTextAligned(canvas, Element.ALIGN_CENTER,
                        phrase, x, y, 30f);
                canvas.restoreState();

                canvas = writer.getDirectContent();
                Phrase left = new Phrase(
                        "Certificate " + certificateNumber + " · Generated "
                                + LocalDate.now(ZoneOffset.UTC)
                                .format(DateTimeFormatter.ISO_LOCAL_DATE),
                        FontFactory.getFont(FontFactory.HELVETICA, 8f, Color.DARK_GRAY));
                ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                        left, document.left(), document.bottom() - 12, 0f);

                Phrase right = new Phrase(
                        "Page " + writer.getPageNumber(),
                        FontFactory.getFont(FontFactory.HELVETICA, 8f, Color.DARK_GRAY));
                ColumnText.showTextAligned(canvas, Element.ALIGN_RIGHT,
                        right, document.right(), document.bottom() - 12, 0f);
            } catch (Exception ignored) {
                // best-effort decorative layer
            }
        }
    }

    /**
     * Snapshot of data the supplier certificate renderer needs. Built by
     * {@code SupplierApplicationService} from the live {@code users} and
     * {@code supplier_applications} rows.
     */
    public record IssuedSupplierCertificateData(
            String certificateNumber,
            String supplierReferenceNumber,
            String fullName,
            String companyRegistrationId,
            String email,
            String phone,
            String reviewerName,
            Instant reviewedAt,
            LocalDate validFrom,
            LocalDate validUntil
    ) {
        public String approvalDate() {
            return reviewedAt == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE
                            .format(reviewedAt.atZone(ZoneOffset.UTC).toLocalDate());
        }

        public String validUntilDate() {
            return validUntil == null
                    ? ""
                    : DateTimeFormatter.ISO_LOCAL_DATE.format(validUntil);
        }
    }

    // =====================================================================
    // Blank Supplier Application Form (portrait A4)
    // =====================================================================

    private static final Font TITLE_FONT =
            FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18f, Color.WHITE);
    private static final Font SUBTITLE_FONT =
            FontFactory.getFont(FontFactory.HELVETICA, 11f, Color.WHITE);
    private static final Font SECTION_FONT =
            FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12f, HEADER_BG);
    private static final Font LABEL_FONT =
            FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10f, Color.DARK_GRAY);
    private static final Font BODY_FONT =
            FontFactory.getFont(FontFactory.HELVETICA, 10f, Color.BLACK);
    private static final Font SMALL_FONT =
            FontFactory.getFont(FontFactory.HELVETICA, 8.5f, Color.DARK_GRAY);

    /**
     * Render the empty Supplier Application Form that a supplier
     * downloads, prints, fills, signs, and rescans. Mirrors the layout of
     * {@link RiderApplicationPdfService#renderBlankRiderApplicationForm()}.
     */
    public byte[] renderBlankSupplierApplicationForm() {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 48, 48, 60, 60);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new FooterPageEvent("Gas Supplier Application Form"));
            document.open();

            document.add(headerBand(
                    "Gas Supplier Application Form",
                    "Gas Delivery & Supplying System"));

            document.add(instruction(
                    "Please complete every field below in BLOCK letters. Tick boxes where applicable. "
                            + "The completed and signed form must be uploaded back to the system "
                            + "alongside the supporting documents listed in section 4."));

            // 1. Company Details
            document.add(section("1. Company Details"));
            document.add(fieldTable(List.of(
                    "Company / Trading Name",
                    "Company Registration ID / Number",
                    "Tax Identification Number (TIN)",
                    "Business Licence Number",
                    "Registered Office Address",
                    "Region",
                    "District",
                    "Phone Number",
                    "Email Address")));

            // 2. Supply Capacity
            document.add(section("2. Supply Capacity"));
            document.add(fieldTable(List.of(
                    "Gas Cylinder Sizes Supplied",
                    "Estimated Monthly Supply Volume",
                    "Storage Facility Address",
                    "Number of Delivery Vehicles",
                    "Years in the Gas Supply Business")));

            // 3. Documents Required
            document.add(section("3. Documents Required"));
            document.add(checkboxTable(List.of(
                    "Completed Signed Application Form",
                    "Company Registration ID",
                    "Business Registration Certificate",
                    "Tax Identification Certificate (TIN)",
                    "Business Licence")));

            // 5. Declaration
            document.add(section("5. Applicant Declaration"));
            document.add(new Paragraph(
                    "I hereby declare that the information provided in this "
                            + "application is true and correct to the best of my "
                            + "knowledge. I understand that providing false "
                            + "information may result in the rejection of my "
                            + "application and the revocation of any supplier "
                            + "certificate issued. I undertake to comply with all "
                            + "applicable regulations governing the storage, "
                            + "handling, and supply of liquefied petroleum gas and "
                            + "to produce the official Gas Supplier Certificate on "
                            + "demand.",
                    BODY_FONT));
            document.add(space(12));
            document.add(signatureTable("Applicant Signature", "Date"));

            // 6. Administrative Use Only
            document.add(section("6. Administrative Use Only"));
            PdfPTable admin = new PdfPTable(2);
            admin.setWidthPercentage(100);
            admin.setWidths(new float[]{1, 1});
            admin.addCell(adminCell("Application Status"));
            admin.addCell(adminCell("Pending / Approved / Rejected"));
            admin.addCell(adminCell("Admin Comments"));
            admin.addCell(adminCell(""));
            admin.addCell(adminCell("Admin Signature"));
            admin.addCell(adminCell(""));
            admin.addCell(adminCell("Approval Date"));
            admin.addCell(adminCell(""));
            document.add(admin);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not render supplier application form: " + e.getMessage(), e);
        }
    }

    // ---- portrait helpers (mirror RiderApplicationPdfService) -----------

    private static PdfPTable headerBand(String title, String subtitle) throws Exception {
        PdfPTable band = new PdfPTable(1);
        band.setWidthPercentage(100);
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(HEADER_BG);
        cell.setPadding(14);
        Paragraph t = new Paragraph(title, TITLE_FONT);
        t.setAlignment(Element.ALIGN_CENTER);
        cell.addElement(t);
        Paragraph s = new Paragraph(subtitle, SUBTITLE_FONT);
        s.setAlignment(Element.ALIGN_CENTER);
        cell.addElement(s);
        band.addCell(cell);
        return band;
    }

    private static Paragraph instruction(String text) {
        Paragraph p = new Paragraph(text, BODY_FONT);
        p.setSpacingBefore(10);
        p.setSpacingAfter(10);
        return p;
    }

    private static Paragraph section(String text) {
        Paragraph p = new Paragraph(text, SECTION_FONT);
        p.setSpacingBefore(14);
        p.setSpacingAfter(6);
        return p;
    }

    private static Paragraph space(float pts) {
        Paragraph p = new Paragraph(" ", BODY_FONT);
        p.setSpacingAfter(pts);
        return p;
    }

    private static PdfPTable fieldTable(List<String> labels) throws Exception {
        PdfPTable t = new PdfPTable(2);
        t.setWidthPercentage(100);
        t.setWidths(new float[]{1, 2});
        for (String label : labels) {
            t.addCell(labelCell(label));
            t.addCell(blankCell());
        }
        return t;
    }

    private static PdfPTable checkboxTable(List<String> labels) throws Exception {
        PdfPTable t = new PdfPTable(2);
        t.setWidthPercentage(100);
        for (String label : labels) {
            PdfPCell c = new PdfPCell(new Phrase("☐  " + label, BODY_FONT));
            c.setPadding(8);
            c.setBorder(Rectangle.BOX);
            c.setBorderColor(SUBTLE_GREY);
            t.addCell(c);
        }
        return t;
    }

    private static PdfPTable signatureTable(String... labels) throws Exception {
        PdfPTable t = new PdfPTable(labels.length);
        t.setWidthPercentage(100);
        t.setWidths(equalWidths(labels.length));
        for (String label : labels) {
            t.addCell(labelCell(label));
        }
        for (int i = 0; i < labels.length; i++) {
            t.addCell(blankCell(40));
        }
        return t;
    }

    private static PdfPCell labelCell(String text) {
        PdfPCell c = new PdfPCell(new Phrase(text, LABEL_FONT));
        c.setBackgroundColor(SUBTLE_GREY);
        c.setPadding(6);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        return c;
    }

    private static PdfPCell blankCell() {
        return blankCell(22);
    }

    private static PdfPCell blankCell(float minHeight) {
        PdfPCell c = new PdfPCell(new Phrase(" ", BODY_FONT));
        c.setMinimumHeight(minHeight);
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        return c;
    }

    private static PdfPCell adminCell(String value) {
        PdfPCell c = new PdfPCell(new Phrase(value, BODY_FONT));
        c.setBorder(Rectangle.BOX);
        c.setBorderColor(new Color(210, 215, 220));
        c.setPadding(8);
        c.setMinimumHeight(30);
        return c;
    }

    private static float[] equalWidths(int n) {
        float[] widths = new float[n];
        for (int i = 0; i < n; i++) widths[i] = 1f;
        return widths;
    }

    /** Stamps a footer on every page so the form is identifiable once printed. */
    private static final class FooterPageEvent extends PdfPageEventHelper {
        private final String title;
        private FooterPageEvent(String title) { this.title = title; }
        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            try {
                PdfPTable footer = new PdfPTable(2);
                footer.setWidthPercentage(100);
                footer.setWidths(new float[]{2, 1});
                footer.getDefaultCell().setBorder(Rectangle.NO_BORDER);
                PdfPCell left = new PdfPCell(new Phrase(
                        title + " · Generated " + LocalDate.now(ZoneOffset.UTC)
                                .format(DateTimeFormatter.ISO_LOCAL_DATE),
                        SMALL_FONT));
                left.setBorder(Rectangle.NO_BORDER);
                footer.addCell(left);
                PdfPCell right = new PdfPCell(new Phrase(
                        "Page " + writer.getPageNumber(), SMALL_FONT));
                right.setBorder(Rectangle.NO_BORDER);
                right.setHorizontalAlignment(Element.ALIGN_RIGHT);
                footer.addCell(right);
                footer.setTotalWidth(document.right() - document.left());
                footer.writeSelectedRows(0, -1, document.left(),
                        document.bottom() - 8, writer.getDirectContent());
            } catch (Exception ignored) {
                // best effort
            }
        }
    }
}
