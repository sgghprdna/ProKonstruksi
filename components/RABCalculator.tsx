import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, FileSpreadsheet, Printer, 
  Eye, Edit2, X, Check, ArrowLeft, ChevronRight, Database, ChevronDown, FileText, File, RotateCcw, AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as docx from 'docx';
import html2pdf from 'html2pdf.js';
import { AHSP_DB, MATERIALS_DB } from '../constants';
import { RABSection, RABItem, Material, AHSPItem } from '../types';

const COMMON_UNITS = ['ls', 'm', 'm2', 'm3', 'kg', 'bh', 'zak', 'btg', 'lbr', 'unit', 'set', 'titik', 'jam', 'hari', 'oh'];

const RABCalculator: React.FC = () => {
  // --- State ---
  const [sections, setSections] = useState<RABSection[]>([]);

  // View State
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemData, setEditingItemData] = useState<Partial<RABItem>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [showAHSPModal, setShowAHSPModal] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false); // Toggle for delete list mode
  
  // Custom Confirmation Modal State
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ sectionId: string, itemId: string } | null>(null);

  // Metadata for Export
  const [projectTitle, setProjectTitle] = useState('');
  const [plannerName, setPlannerName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRounding, setIsRounding] = useState(true);
  
  // Database Access
  const [materials] = useState<Material[]>(MATERIALS_DB);

  // --- Helpers ---
  const calculateUnitPriceFromAHSP = (ahsp: AHSPItem): number => {
    return ahsp.components.reduce((total, comp) => {
      const material = materials.find(m => m.id === comp.materialId);
      return total + (material ? material.price * comp.coefficient : 0);
    }, 0);
  };

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  const calculateTotal = () => {
    let total = sections.reduce((acc, section) => {
      return acc + section.items.reduce((sAcc, item) => sAcc + item.totalPrice, 0);
    }, 0);
    
    if (isRounding) {
      total = Math.round(total / 100) * 100;
    }
    return total;
  };

  // --- Actions ---

  const resetData = () => {
    if (window.confirm("Hapus semua data proyek dan mulai dari nol? Tindakan ini tidak bisa dibatalkan.")) {
      setSections([]);
      setProjectTitle('');
      setPlannerName('');
      setLocation('');
      setDate(new Date().toISOString().split('T')[0]);
      setIsDeleteMode(false);
    }
  };

  const addSection = () => {
    setIsDeleteMode(false); // Ensure we leave delete mode when adding
    const newId = `s${Date.now()}`;
    // Initialize name as empty string so input is blank
    const newSection: RABSection = { id: newId, name: '', items: [] };
    setSections([...sections, newSection]);
    // Immediately open the popup for editing
    setActiveSectionId(newId);
  };

  // Trigger the custom modal for SECTION
  const requestDeleteSection = (sectionId: string) => {
    setSectionToDelete(sectionId);
  };

  // Execute delete SECTION after confirmation
  const confirmDeleteSection = () => {
    if (sectionToDelete) {
      const updatedSections = sections.filter(s => s.id !== sectionToDelete);
      setSections(updatedSections);
      
      if (activeSectionId === sectionToDelete) setActiveSectionId(null);
      setSectionToDelete(null); // Close modal

      // Critical Fix: Exit delete mode if list becomes empty to prevent locking UI
      if (updatedSections.length === 0) {
        setIsDeleteMode(false);
      }
    }
  };

  const updateSectionName = (id: string, name: string) => {
    setSections(sections.map(s => s.id === id ? { ...s, name } : s));
  };

  const handleSaveItem = () => {
    // Validation
    if (!activeSectionId) {
        console.error("Error: No active section ID found.");
        return;
    }
    
    if (!editingItemData.description || editingItemData.description.trim() === "") {
        alert("Mohon isi Uraian Kegiatan terlebih dahulu.");
        return;
    }

    const volume = editingItemData.volume || 0;
    const unitPrice = editingItemData.unitPrice || 0;

    const newItem: RABItem = {
      id: editingItemData.id || `i${Date.now()}`,
      description: editingItemData.description,
      volume: volume,
      unit: editingItemData.unit || 'ls',
      unitPrice: unitPrice,
      totalPrice: volume * unitPrice
    };

    setSections(prevSections => {
        return prevSections.map(section => {
            if (section.id === activeSectionId) {
                const itemIndex = section.items.findIndex(i => i.id === newItem.id);
                
                if (itemIndex > -1) {
                    // Update existing item
                    const updatedItems = [...section.items];
                    updatedItems[itemIndex] = newItem;
                    return { ...section, items: updatedItems };
                } else {
                    // Add new item
                    return { ...section, items: [...section.items, newItem] };
                }
            }
            return section;
        });
    });

    closeItemForm();
  };

  const editItem = (item: RABItem) => {
    setEditingItemData({ ...item });
    setShowItemForm(true);
  };

  // Trigger the custom modal for ITEM
  const requestDeleteItem = (sectionId: string, itemId: string) => {
    setItemToDelete({ sectionId, itemId });
  };

  // Execute delete ITEM after confirmation
  const confirmDeleteItem = () => {
    if (itemToDelete) {
        setSections(prev => prev.map(s => {
          if (s.id === itemToDelete.sectionId) {
            return { ...s, items: s.items.filter(i => i.id !== itemToDelete.itemId) };
          }
          return s;
        }));
        setItemToDelete(null);
    }
  };

  const openNewItemForm = () => {
    setEditingItemData({
      id: `i${Date.now()}`,
      description: '',
      volume: 1,
      unit: 'm3',
      unitPrice: 0
    });
    setShowItemForm(true);
  };

  const closeItemForm = () => {
    setShowItemForm(false);
    setEditingItemData({});
  };

  const addItemFromAHSP = (ahspId: string) => {
    if (!activeSectionId) return;
    const ahsp = AHSP_DB.find(a => a.id === ahspId);
    if (!ahsp) return;
    
    const price = calculateUnitPriceFromAHSP(ahsp);
    
    // Important: Preserve the ID if we are editing an existing item, otherwise generate new
    const itemId = editingItemData.id || `i${Date.now()}`;

    setEditingItemData({
      ...editingItemData,
      id: itemId,
      description: ahsp.name,
      // Keep current volume if user entered it, otherwise default to 1
      volume: editingItemData.volume || 1,
      unit: ahsp.unit,
      unitPrice: price
    });
    setShowAHSPModal(false);
    setShowItemForm(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    try {
      const element = document.getElementById('rab-preview-content');
      const opt = {
        margin:       [10, 10, 10, 10], // top, left, bottom, right
        filename:     `RAB_${(projectTitle || 'Proyek').replace(/[^a-z0-9]/gi, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // Fix for ESM import of html2pdf sometimes being nested in default
      const html2pdfLib = (html2pdf as any).default || html2pdf;
      
      if (typeof html2pdfLib !== 'function') {
        throw new Error("Library html2pdf not loaded properly.");
      }

      await html2pdfLib().from(element).set(opt).save();
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Gagal membuat PDF. Pastikan koneksi internet stabil untuk memuat library. Alternatif: Gunakan tombol 'Cetak' lalu pilih 'Simpan sebagai PDF'.");
    }
  };

  const handleExportDocx = () => {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, BorderStyle, TextRun, AlignmentType, VerticalAlign } = docx;

    const cleanNumber = (num: number) => new Intl.NumberFormat('id-ID').format(num);

    // 1. Create Rows Array
    const tableRows = [];

    // --- Header Row ---
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: "NO", alignment: AlignmentType.CENTER, style: "strong" })], width: { size: 5, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" } }),
          new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: "URAIAN KEGIATAN", alignment: AlignmentType.CENTER, style: "strong" })], width: { size: 40, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" } }),
          new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: "VOLUME", alignment: AlignmentType.CENTER, style: "strong" })], width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" } }),
          new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: "UNIT", alignment: AlignmentType.CENTER, style: "strong" })], width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" } }),
          new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: "HARGA SATUAN", alignment: AlignmentType.RIGHT, style: "strong" })], width: { size: 15, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" } }),
          new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: "JUMLAH", alignment: AlignmentType.RIGHT, style: "strong" })], width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: "E0E0E0" } }),
        ],
      })
    );

    // --- Sections & Items ---
    sections.forEach((section, idx) => {
        const subTotal = section.items.reduce((acc, i) => acc + i.totalPrice, 0);

        // Section Header
        tableRows.push(
            new TableRow({
                children: [
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: String.fromCharCode(65 + idx), alignment: AlignmentType.CENTER, style: "strong" })], shading: { fill: "F5F5F5" } }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, columnSpan: 5, children: [new Paragraph({ text: (section.name || "").toUpperCase(), style: "strong" })], shading: { fill: "F5F5F5" } }),
                ]
            })
        );

        // Items
        section.items.forEach((item, iIdx) => {
            tableRows.push(
                new TableRow({
                    children: [
                        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: (iIdx + 1).toString(), alignment: AlignmentType.CENTER })] }),
                        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: item.description })] }),
                        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: item.volume.toString(), alignment: AlignmentType.CENTER })] }),
                        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: item.unit, alignment: AlignmentType.CENTER })] }),
                        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: cleanNumber(item.unitPrice), alignment: AlignmentType.RIGHT })] }),
                        new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: cleanNumber(item.totalPrice), alignment: AlignmentType.RIGHT })] }),
                    ]
                })
            );
        });

        // Subtotal Row
        tableRows.push(
            new TableRow({
                children: [
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, columnSpan: 5, children: [new Paragraph({ text: "SUB TOTAL", alignment: AlignmentType.RIGHT, style: "strong" })], shading: { fill: "F5F5F5" } }),
                    new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: cleanNumber(subTotal), alignment: AlignmentType.RIGHT, style: "strong" })], shading: { fill: "F5F5F5" } }),
                ]
            })
        );
    });

    // --- Grand Total ---
    const grandTotal = calculateTotal();
    tableRows.push(
        new TableRow({
            children: [
                new TableCell({ verticalAlign: VerticalAlign.CENTER, columnSpan: 5, children: [new Paragraph({ text: "GRAND TOTAL", alignment: AlignmentType.RIGHT, style: "strong" })] }),
                new TableCell({ verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ text: `Rp ${cleanNumber(grandTotal)}`, alignment: AlignmentType.RIGHT, style: "strong" })] }),
            ]
        })
    );

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: "RENCANA ANGGARAN BIAYA (RAB)",
                    heading: docx.HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 }
                }),
                new Paragraph({
                    text: (projectTitle || "PROYEK KONSTRUKSI").toUpperCase(),
                    heading: docx.HeadingLevel.HEADING_2,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 }
                }),
                new Table({
                    rows: tableRows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }),
                new Paragraph({ text: "" }), // Spacer
                new Paragraph({ text: "" }),
                // Signatures
                new Paragraph({
                    children: [
                        new TextRun({ text: `${location || 'Lokasi'}, ${new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, break: 1 }),
                        new TextRun({ text: "Dibuat Oleh,", break: 2, bold: true }),
                        new TextRun({ text: (plannerName || 'Perencana').toUpperCase(), break: 5, bold: true, underline: { type: docx.UnderlineType.SINGLE } }),
                    ],
                    alignment: AlignmentType.RIGHT
                })
            ],
        }],
    });

    Packer.toBlob(doc).then((blob) => {
        // Save logic (simplified for browser)
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RAB_${(projectTitle || 'Proyek').replace(/[^a-z0-9]/gi, '_')}.docx`;
        a.click();
        window.URL.revokeObjectURL(url);
    });
  };

  const handleExportExcel = () => {
    const grandTotal = calculateTotal();
    
    // Build data array for SheetJS (Array of Arrays)
    const wsData: any[][] = [];

    // Row 0: Title
    wsData.push(["RENCANA ANGGARAN BIAYA (RAB)"]);
    // Row 1: Project Name
    wsData.push([projectTitle || 'PROYEK KONSTRUKSI']);
    // Row 2: Spacer
    wsData.push([""]); 

    // Row 3: Headers (This is where the table starts)
    const HEADER_ROW_INDEX = 3;
    wsData.push(["NO", "URAIAN KEGIATAN", "VOLUME", "UNIT", "HARGA SATUAN", "JUMLAH"]);

    // Data
    sections.forEach((section, idx) => {
      const subTotal = section.items.reduce((acc, i) => acc + i.totalPrice, 0);
      
      // Section Header (e.g., "A. PEKERJAAN PERSIAPAN")
      wsData.push([
        String.fromCharCode(65 + idx), 
        (section.name || '').toUpperCase(), 
        "", 
        "", 
        "", 
        ""
      ]);

      // Items
      section.items.forEach((item, iIdx) => {
        wsData.push([
          iIdx + 1,
          item.description,
          item.volume,
          item.unit,
          item.unitPrice,
          item.totalPrice
        ]);
      });

      // Subtotal
      wsData.push(["", "SUB TOTAL", "", "", "", subTotal]);
    });

    // Grand Total Row
    wsData.push(["", "GRAND TOTAL", "", "", "", grandTotal]);
    
    const GRAND_TOTAL_ROW_INDEX = wsData.length - 1;

    // Spacer after table
    wsData.push([""]); 
    wsData.push([""]); 

    // Signature Block
    const dateStr = `${location || 'Lokasi'}, ${new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    wsData.push(["", "", "", "", dateStr]);
    wsData.push(["", "", "", "", "Dibuat Oleh,"]);
    wsData.push(["", "", "", "", ""]); // Space for signature
    wsData.push(["", "", "", "", ""]);
    wsData.push(["", "", "", "", ""]);
    wsData.push(["", "", "", "", plannerName || 'Perencana']);

    // Create Workbook and Worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // --- APPLY STYLES (Using xlsx-js-style features) ---
    
    // Define Styles
    const thinBorder = { style: "thin", color: { rgb: "000000" } };
    const borderStyle = {
        top: thinBorder,
        bottom: thinBorder,
        left: thinBorder,
        right: thinBorder
    };
    
    const boldStyle = { font: { bold: true } };
    const headerStyle = { 
        font: { bold: true }, 
        alignment: { horizontal: "center", vertical: "center" },
        fill: { fgColor: { rgb: "E0E0E0" } }, // Gray background for header
        border: borderStyle
    };
    const sectionStyle = {
        font: { bold: true },
        fill: { fgColor: { rgb: "F5F5F5" } },
        border: borderStyle
    };
    const cellBorderStyle = { border: borderStyle };

    // Get the range of the sheet
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");

    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({r: R, c: C});
            
            // CRITICAL FIX: Ensure the cell exists so we can style it, even if it's empty
            if (!ws[cellRef]) {
                ws[cellRef] = { t: 's', v: '' };
            }

            // 1. Project Title (Row 0 & 1) - Center & Bold
            if (R <= 1) {
                ws[cellRef].s = { ...boldStyle, alignment: { horizontal: "center" } };
                continue;
            }

            // 2. Table Borders
            // Apply borders only if we are within the table rows (Header -> Grand Total)
            if (R >= HEADER_ROW_INDEX && R <= GRAND_TOTAL_ROW_INDEX) {
                
                // Default to basic border
                let cellStyle: any = { ...cellBorderStyle };

                // Header Row
                if (R === HEADER_ROW_INDEX) {
                    cellStyle = { ...headerStyle };
                }
                // Grand Total Row
                else if (R === GRAND_TOTAL_ROW_INDEX) {
                    cellStyle = { ...cellStyle, ...boldStyle };
                    if (C === 5) { // Total Column
                       cellStyle.numFmt = "#,##0";
                    }
                }
                // Content Rows
                else {
                   // Check if it's a Number column (Vol, Harga, Jumlah)
                   if (C === 2 || C === 4 || C === 5) {
                       // Vol, Harga, Jumlah -> Number Format
                       if (ws[cellRef].v && typeof ws[cellRef].v === 'number') {
                           cellStyle.numFmt = "#,##0";
                       }
                   }
                   
                   const rowValues = wsData[R];
                   // Subtotal Row? (Col 1 == "SUB TOTAL")
                   if (rowValues && rowValues[1] === "SUB TOTAL") {
                       cellStyle = { ...cellStyle, ...boldStyle, fill: { fgColor: { rgb: "F5F5F5" } } };
                   }
                   // Section Row? (Col 2,3,4,5 empty, Col 0 has value)
                   else if (rowValues && rowValues[2] === "" && rowValues[3] === "" && rowValues[4] === "" && rowValues[5] === "") {
                       cellStyle = { ...sectionStyle };
                   }
                }

                ws[cellRef].s = cellStyle;
            }
        }
    }

    // Merge Cells for Title
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }); // Merge Main Title
    ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }); // Merge Project Name
    
    // Merge "Grand Total" Label
    ws['!merges'].push({ s: { r: GRAND_TOTAL_ROW_INDEX, c: 1 }, e: { r: GRAND_TOTAL_ROW_INDEX, c: 4 } });

    // Merge Subtotals
    for (let r = HEADER_ROW_INDEX + 1; r < GRAND_TOTAL_ROW_INDEX; r++) {
        if (wsData[r] && wsData[r][1] === "SUB TOTAL") {
             ws['!merges'].push({ s: { r: r, c: 1 }, e: { r: r, c: 4 } });
        }
    }

    // Column Widths
    ws['!cols'] = [
        { wch: 5 },  // NO
        { wch: 40 }, // URAIAN
        { wch: 10 }, // VOL
        { wch: 10 }, // SAT
        { wch: 15 }, // HARGA
        { wch: 15 }, // JUMLAH
    ];

    // Append Sheet
    XLSX.utils.book_append_sheet(wb, ws, "RAB");

    // Write File
    const fileName = `RAB_${(projectTitle || 'Proyek').replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // --- Render Components ---

  // 1. PRINT PREVIEW (Standard Table Layout)
  if (showPreview) {
    const grandTotal = calculateTotal();

    return (
      <div className="absolute inset-0 bg-gray-200 overflow-auto p-4 z-[100] text-black">
        <button 
            onClick={() => setShowPreview(false)} 
            className="fixed top-4 right-4 z-[110] bg-red-50 text-red-600 p-2 rounded-full hover:bg-red-100 shadow-md print:hidden"
        >
            <X size={24} />
        </button>

        {/* 
            Fix: 
            1. Removed 'min-h-[297mm]' to prevent extra blank page in PDF export (height will be auto).
            2. Added explicit <style> block for html2pdf to recognize vertical-align: middle.
        */}
        <div id="rab-preview-content" className="max-w-[210mm] mx-auto bg-white shadow-lg p-8 text-sm print:shadow-none print:p-0 print:w-full print:max-w-none relative text-black">
            <style>{`
                #rab-preview-content th, #rab-preview-content td {
                    vertical-align: middle !important;
                }
                #rab-preview-content table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                }
                .pdf-center-align {
                    vertical-align: middle !important;
                    display: table-cell !important;
                }
            `}</style>
            
            {/* Header */}
            <div className="text-center font-bold mb-6 border-b-2 border-black pb-4 mt-8 print:mt-0 text-black">
                <h1 className="text-xl uppercase text-black">Rencana Anggaran Biaya (RAB)</h1>
                <h2 className="text-lg uppercase text-black">{projectTitle}</h2>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-black mb-6 text-black">
                <thead>
                    <tr className="bg-gray-300 text-black">
                        <th className="border border-black p-2 w-12 text-center font-bold text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>NO</th>
                        <th className="border border-black p-2 text-center font-bold text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>URAIAN KEGIATAN</th>
                        <th className="border border-black p-2 w-20 text-center font-bold text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>VOLUME</th>
                        <th className="border border-black p-2 w-16 text-center font-bold text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>UNIT</th>
                        <th className="border border-black p-2 w-32 text-right font-bold text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'right' }}>HARGA SATUAN</th>
                        <th className="border border-black p-2 w-32 text-right font-bold text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'right' }}>JUMLAH</th>
                    </tr>
                </thead>
                <tbody>
                    {sections.length === 0 ? (
                        <tr className="text-black">
                            <td colSpan={6} className="border border-black p-8 text-center italic text-gray-500 pdf-center-align" style={{ verticalAlign: 'middle' }}>
                                Belum ada item pekerjaan yang ditambahkan.
                            </td>
                        </tr>
                    ) : (
                        sections.map((section, idx) => {
                            const subTotal = section.items.reduce((acc, i) => acc + i.totalPrice, 0);
                            return (
                                <React.Fragment key={section.id}>
                                    <tr className="font-bold bg-gray-100 text-black">
                                        <td className="border border-black p-2 text-center text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>{String.fromCharCode(65 + idx)}</td>
                                        <td className="border border-black p-2 uppercase text-black pdf-center-align" colSpan={5} style={{ verticalAlign: 'middle' }}>{section.name}</td>
                                    </tr>
                                    {section.items.map((item, iIdx) => (
                                        <tr key={item.id} className="text-black">
                                            <td className="border border-black p-2 text-center text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>{iIdx + 1}</td>
                                            <td className="border border-black p-2 text-black pdf-center-align" style={{ verticalAlign: 'middle' }}>{item.description}</td>
                                            <td className="border border-black p-2 text-center text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>{item.volume}</td>
                                            <td className="border border-black p-2 text-center text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'center' }}>{item.unit}</td>
                                            <td className="border border-black p-2 text-right text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                                                {new Intl.NumberFormat('id-ID').format(item.unitPrice)}
                                            </td>
                                            <td className="border border-black p-2 text-right text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                                                {new Intl.NumberFormat('id-ID').format(item.totalPrice)}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="font-bold bg-gray-100 text-black">
                                        <td className="border border-black p-2 text-black pdf-center-align" colSpan={5} align="right" style={{ verticalAlign: 'middle', textAlign: 'right' }}>SUB TOTAL</td>
                                        <td className="border border-black p-2 text-right text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'right' }}>{new Intl.NumberFormat('id-ID').format(subTotal)}</td>
                                    </tr>
                                </React.Fragment>
                            );
                        })
                    )}
                    <tr className="font-bold text-base border-t-2 border-black text-black">
                        <td className="border border-black p-3 text-black pdf-center-align" colSpan={5} align="right" style={{ verticalAlign: 'middle', textAlign: 'right' }}>GRAND TOTAL</td>
                        <td className="border border-black p-3 text-right text-black pdf-center-align" style={{ verticalAlign: 'middle', textAlign: 'right' }}>{formatRupiah(grandTotal)}</td>
                    </tr>
                </tbody>
            </table>

            <div className="flex justify-end mt-12 break-inside-avoid text-black">
                <div className="text-center w-64 text-black">
                    <p className="mb-1 text-black">{location || 'Lokasi'}, {new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p className="font-bold mb-20 text-black">Dibuat Oleh,</p>
                    <p className="font-bold underline uppercase text-black">{plannerName || 'Perencana'}</p>
                </div>
            </div>
        </div>

        {/* Action Floating Bar */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-2 print:hidden bg-white p-3 rounded-2xl shadow-2xl border border-gray-200 z-50 w-[90%] max-w-xl">
            <button onClick={handlePrint} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-xl hover:bg-gray-900 text-xs md:text-sm font-bold">
                <Printer size={16}/> Cetak
            </button>
            <button onClick={handleExportPDF} className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-700 text-xs md:text-sm font-bold">
                <FileText size={16}/> PDF
            </button>
            <button onClick={handleExportDocx} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 text-xs md:text-sm font-bold">
                <File size={16}/> DOCX
            </button>
            <button onClick={handleExportExcel} className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 text-xs md:text-sm font-bold">
                <FileSpreadsheet size={16}/> Excel
            </button>
        </div>

      </div>
    );
  }

  const activeSection = sections.find(s => s.id === activeSectionId);
  const grandTotal = calculateTotal();

  // 2. MAIN EDITOR VIEW
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
        {/* Top Bar */}
        <div className="bg-white px-4 py-3 shadow-sm border-b border-gray-200 z-20 flex justify-between items-center">
            <div>
                <h2 className="text-lg font-bold text-slate-800">Pembuatan RAB</h2>
                <p className="text-xs text-slate-500">Kelola pekerjaan & biaya.</p>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={resetData}
                    className="bg-red-50 text-red-500 p-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-red-100"
                    title="Reset Data"
                >
                    <RotateCcw size={16} />
                </button>
                <button 
                    onClick={() => setShowPreview(true)}
                    className="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-100"
                >
                    <Eye size={16} /> Preview
                </button>
            </div>
        </div>

        {/* Main Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-6">
            
            {/* Project Info Card */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                    <FileSpreadsheet size={16} className="text-indigo-500"/> Informasi Proyek
                </h3>
                <div className="grid grid-cols-1 gap-3">
                    {/* Project Title Input */}
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Nama Proyek / Judul</label>
                        <input 
                            type="text" 
                            placeholder="Contoh: RUMAH TINGGAL TYPE 36" 
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800 font-bold uppercase"
                            value={projectTitle}
                            onChange={e => setProjectTitle(e.target.value.toUpperCase())}
                        />
                    </div>

                    <input 
                        type="text" 
                        placeholder="Nama Perencana (misal: CV. Maju Jaya)" 
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800 placeholder-slate-400"
                        value={plannerName}
                        onChange={e => setPlannerName(e.target.value)}
                    />
                    <div className="flex gap-3">
                        <input 
                            type="text" 
                            placeholder="Kota / Lokasi" 
                            className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                        />
                        <input 
                            type="date" 
                            className="w-1/3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Section List (Cards) */}
            <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daftar Pekerjaan</label>
                    {sections.length > 0 && (
                        <button
                            onClick={() => setIsDeleteMode(!isDeleteMode)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-sm ${isDeleteMode ? 'bg-slate-800 text-white' : 'bg-white text-red-500 border border-red-100 hover:bg-red-50'}`}
                        >
                            {isDeleteMode ? (
                                <><Check size={14} strokeWidth={3} /> Selesai</>
                            ) : (
                                <><Trash2 size={14} /> Hapus</>
                            )}
                        </button>
                    )}
                </div>
                
                {sections.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 bg-white rounded-xl border-2 border-dashed border-gray-200">
                        <p>Belum ada pekerjaan.</p>
                        <p className="text-xs">Klik tombol di bawah untuk mulai.</p>
                    </div>
                ) : (
                    sections.map((section, idx) => {
                        const subTotal = section.items.reduce((acc, i) => acc + i.totalPrice, 0);
                        return (
                            <div key={section.id} className="flex items-stretch gap-2 animate-in slide-in-from-bottom-1 duration-200">
                                <div 
                                    onClick={() => !isDeleteMode && setActiveSectionId(section.id)}
                                    className={`
                                        flex-1 bg-white p-4 rounded-xl shadow-sm border transition-all relative overflow-hidden 
                                        ${isDeleteMode ? 'border-red-200 bg-red-50/10 cursor-default' : 'border-gray-200 hover:shadow-md cursor-pointer group'}
                                    `}
                                >
                                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isDeleteMode ? 'bg-red-400' : 'bg-indigo-500'}`}></div>
                                    <div className="flex justify-between items-start pl-3">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-800 text-base mb-1 uppercase line-clamp-1">{section.name || 'Pekerjaan Baru (Edit Nama)'}</h4>
                                            <p className="text-xs text-slate-500 mb-2">{section.items.length} item uraian</p>
                                            <p className={`font-bold text-lg ${isDeleteMode ? 'text-slate-400' : 'text-indigo-600'}`}>{formatRupiah(subTotal)}</p>
                                        </div>
                                        {!isDeleteMode && (
                                            <div className="flex flex-col gap-2 items-end mt-8">
                                                <ChevronRight className="text-gray-300 group-hover:text-indigo-400" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isDeleteMode && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            requestDeleteSection(section.id);
                                        }}
                                        className="w-16 bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center shadow-sm transition-all"
                                        title="Hapus Permanen"
                                    >
                                        <Trash2 size={24} />
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Add Section Button - Show if not deleting OR if list is empty */}
                {(!isDeleteMode || sections.length === 0) && (
                    <button 
                        onClick={addSection}
                        className="w-full py-4 bg-white border-2 border-dashed border-indigo-300 rounded-xl text-indigo-500 font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all shadow-sm"
                    >
                        <Plus size={20} /> Tambah Pekerjaan Baru
                    </button>
                )}
            </div>
        </div>

        {/* Fixed Footer for Total */}
        <div className="bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex justify-between items-center z-30">
            <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Estimasi Total Biaya</p>
                <p className="text-2xl font-extrabold text-slate-800">{formatRupiah(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
                <label className="flex flex-col items-end cursor-pointer mr-2">
                    <input 
                        type="checkbox" 
                        checked={isRounding} 
                        onChange={(e) => setIsRounding(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400">Bulatkan</span>
                </label>
            </div>
        </div>

        {/* --- CUSTOM CONFIRMATION MODAL FOR SECTION --- */}
        {sectionToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform scale-100 animate-in zoom-in-95 duration-200">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="bg-red-100 p-4 rounded-full">
                            <AlertTriangle size={32} className="text-red-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Hapus Pekerjaan?</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Item ini akan dihapus permanen beserta seluruh uraian di dalamnya.
                            </p>
                        </div>
                        <div className="flex gap-3 w-full mt-2">
                            <button 
                                onClick={() => setSectionToDelete(null)}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                Batal
                            </button>
                            <button 
                                onClick={confirmDeleteSection}
                                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                            >
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- CUSTOM CONFIRMATION MODAL FOR ITEM (Uraian Kegiatan) --- */}
        {itemToDelete && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 transform scale-100 animate-in zoom-in-95 duration-200">
                    <div className="flex flex-col items-center text-center space-y-4">
                        <div className="bg-red-100 p-4 rounded-full">
                            <AlertTriangle size={32} className="text-red-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Hapus Item Uraian?</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Detail kegiatan ini akan dihapus dari daftar pekerjaan.
                            </p>
                        </div>
                        <div className="flex gap-3 w-full mt-2">
                            <button 
                                onClick={() => setItemToDelete(null)}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                Batal
                            </button>
                            <button 
                                onClick={confirmDeleteItem}
                                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                            >
                                Hapus
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- POPUP: SECTION EDITOR (Full Screen on Mobile) --- */}
        {activeSectionId && activeSection && (
            <div className="absolute inset-0 z-[60] bg-gray-50 flex flex-col animate-in slide-in-from-bottom duration-200">
                {/* Popup Header */}
                <div className="bg-indigo-600 text-white p-4 shadow-md flex items-center gap-3">
                    <button onClick={() => setActiveSectionId(null)} className="hover:bg-indigo-700 p-1 rounded-full">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex-1">
                         <p className="text-indigo-200 text-xs uppercase font-bold">Edit Pekerjaan</p>
                         <input 
                            type="text" 
                            className="bg-transparent border-b border-indigo-400 text-white font-bold text-lg w-full focus:outline-none focus:border-white placeholder-indigo-300 uppercase"
                            value={activeSection.name}
                            onChange={(e) => updateSectionName(activeSection.id, e.target.value.toUpperCase())}
                            placeholder="NAMA PEKERJAAN"
                         />
                    </div>
                    <button 
                        onClick={() => requestDeleteSection(activeSection.id)}
                        className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg shadow-sm transition-colors"
                        title="Hapus Pekerjaan Ini"
                    >
                        <Trash2 size={20} />
                    </button>
                </div>

                {/* Popup Content: List of Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activeSection.items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 opacity-50 h-full">
                            <FileSpreadsheet size={48} className="mx-auto mb-4 text-gray-400"/>
                            <p className="text-gray-600 font-bold">Belum ada uraian kegiatan.</p>
                            <p className="text-sm text-center mt-1">Tekan tombol di bawah atau di atas<br/>untuk menambahkan item pekerjaan.</p>
                        </div>
                    ) : (
                        activeSection.items.map(item => (
                            <div key={item.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center">
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-800 text-sm mb-1">{item.description}</h4>
                                    <div className="text-xs text-slate-500 flex gap-3">
                                        <span className="bg-gray-100 px-2 py-0.5 rounded">{item.volume} {item.unit}</span>
                                        <span>x {formatRupiah(item.unitPrice)}</span>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-2">
                                    <span className="font-bold text-indigo-600 text-sm">{formatRupiah(item.totalPrice)}</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => editItem(item)} className="text-gray-400 hover:text-indigo-600">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => requestDeleteItem(activeSection.id, item.id)} className="text-gray-400 hover:text-red-500">
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Popup Footer Action */}
                <div className="p-4 bg-white border-t border-gray-200">
                    <button 
                        onClick={openNewItemForm}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 flex justify-center items-center gap-2"
                    >
                        <Plus size={20} /> Tambah Uraian Kegiatan
                    </button>
                </div>
            </div>
        )}

        {/* --- MODAL: ITEM FORM (Nested) --- */}
        {showItemForm && (
            <div className="absolute inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="bg-white px-4 py-4 border-b border-gray-200 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">
                                {editingItemData.id ? 'Edit Item Pekerjaan' : 'Tambah Item Pekerjaan'}
                            </h3>
                            <p className="text-xs text-slate-500">Masukkan detail uraian kegiatan.</p>
                        </div>
                        <button onClick={closeItemForm} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="p-5 space-y-5 overflow-y-auto">
                        {/* Input Uraian */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Uraian Kegiatan</label>
                            <div className="flex gap-2">
                                <textarea 
                                    rows={2}
                                    className="flex-1 p-3 border border-gray-300 rounded-xl text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-gray-50 focus:bg-white transition-colors"
                                    placeholder="Contoh: Pasangan Dinding Bata Merah..."
                                    value={editingItemData.description || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        // Capitalize first letter only
                                        const formatted = val.length > 0 ? val.charAt(0).toUpperCase() + val.slice(1) : val;
                                        setEditingItemData({...editingItemData, description: formatted});
                                    }}
                                />
                                <button 
                                    onClick={() => setShowAHSPModal(true)}
                                    className="bg-indigo-50 text-indigo-600 px-3 rounded-xl hover:bg-indigo-100 border border-indigo-100 flex flex-col items-center justify-center gap-1 min-w-[80px]"
                                >
                                    <Database size={20} />
                                    <span className="text-[10px] font-bold">Database</span>
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            {/* Volume */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Volume</label>
                                <input 
                                    type="number" 
                                    inputMode="decimal"
                                    className="w-full p-3 border border-gray-300 rounded-xl text-slate-800 font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="0"
                                    value={editingItemData.volume === 0 ? '' : editingItemData.volume}
                                    onChange={e => setEditingItemData({...editingItemData, volume: parseFloat(e.target.value) || 0})}
                                />
                            </div>
                            {/* Unit Dropdown */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Satuan</label>
                                <div className="relative">
                                    <select 
                                        className="w-full p-3 border border-gray-300 rounded-xl text-slate-800 font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none bg-white"
                                        value={editingItemData.unit || 'm3'}
                                        onChange={e => setEditingItemData({...editingItemData, unit: e.target.value})}
                                    >
                                    {COMMON_UNITS.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                        <ChevronDown size={16} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Harga Satuan */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Harga Satuan</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Rp</span>
                                <input 
                                    type="number" 
                                    inputMode="numeric"
                                    className="w-full pl-10 p-3 border border-gray-300 rounded-xl text-slate-800 font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="0"
                                    value={editingItemData.unitPrice === 0 ? '' : editingItemData.unitPrice}
                                    onChange={e => setEditingItemData({...editingItemData, unitPrice: parseFloat(e.target.value) || 0})}
                                />
                            </div>
                            <div className="text-right mt-1">
                                <span className="text-xs text-gray-400 font-medium">
                                    {formatRupiah(editingItemData.unitPrice || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Total Display */}
                        <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-indigo-400 uppercase">Total Jumlah</p>
                                <p className="text-lg font-extrabold text-indigo-700">
                                    {formatRupiah((editingItemData.volume || 0) * (editingItemData.unitPrice || 0))}
                                </p>
                            </div>
                            <div className="bg-white p-2 rounded-full shadow-sm">
                                <Check size={20} className="text-indigo-600"/>
                            </div>
                        </div>

                        <button 
                            onClick={handleSaveItem}
                            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all"
                        >
                            Simpan Item
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- MODAL: DATABASE AHSP --- */}
        {showAHSPModal && (
             <div className="absolute inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
                 <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h3 className="font-bold text-lg">Database AHSP (SNI)</h3>
                        <button onClick={() => setShowAHSPModal(false)}><X/></button>
                    </div>
                    <div className="overflow-y-auto p-2">
                        {AHSP_DB.map(ahsp => (
                             <button
                                key={ahsp.id}
                                onClick={() => addItemFromAHSP(ahsp.id)}
                                className="w-full text-left p-3 border-b border-gray-100 hover:bg-indigo-50 rounded-lg transition-colors group"
                            >
                                <span className="font-bold block text-slate-800 group-hover:text-indigo-700">{ahsp.name}</span>
                                <div className="flex justify-between mt-1">
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{ahsp.category}</span>
                                    <span className="text-xs font-bold text-indigo-600">{formatRupiah(calculateUnitPriceFromAHSP(ahsp))} / {ahsp.unit}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                 </div>
             </div>
        )}

    </div>
  );
};

export default RABCalculator;