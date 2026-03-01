/* ============================================================
   PDF EXPORT — Quiet Eye Blueprint PDF Generation
   ============================================================
   Uses jsPDF to generate a professional PDF blueprint document
   containing track overview, corner-by-corner QE protocol,
   and training schedule.
   ============================================================ */

const PDFExport = {

    /**
     * Generate and download a QE Blueprint PDF.
     * @param {Object} options
     * @param {string} options.trackName — circuit name
     * @param {string} options.vehicleType — motorcycle|car|kart|formula
     * @param {string} options.clientName — optional client name
     * @param {Array} options.corners — corner data array
     * @param {Object} options.blueprint — generated blueprint data (from pipeline)
     * @param {Object} options.trackData — track research data
     */
    generate(options) {
        const {
            trackName = 'Unknown Track',
            vehicleType = 'car',
            clientName = '',
            corners = [],
            blueprint = null,
            trackData = null
        } = options;

        // jsPDF is loaded from CDN as window.jspdf
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageW = 210;
        const pageH = 297;
        const margin = 15;
        const contentW = pageW - margin * 2;
        let y = margin;

        // ── Colors ──
        const colors = {
            cyan: [0, 240, 255],
            orange: [255, 159, 28],
            green: [16, 185, 129],
            purple: [139, 92, 246],
            red: [239, 68, 68],
            dark: [10, 10, 15],
            text: [230, 230, 235],
            muted: [150, 150, 160],
            cardBg: [22, 22, 30],
        };

        // ── Utility Functions ──
        const setColor = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        const setDrawColor = (rgb) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
        const setFillColor = (rgb) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);

        const checkPage = (needed) => {
            if (y + needed > pageH - margin) {
                doc.addPage();
                y = margin;
                return true;
            }
            return false;
        };

        const drawHLine = (yPos, color = colors.muted) => {
            setDrawColor(color);
            doc.setLineWidth(0.3);
            doc.line(margin, yPos, pageW - margin, yPos);
        };

        // ══════════════════════════════════════════════
        //  PAGE 1: TITLE & TRACK OVERVIEW
        // ══════════════════════════════════════════════

        // Dark background
        setFillColor(colors.dark);
        doc.rect(0, 0, pageW, pageH, 'F');

        // Title
        y = 30;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        setColor(colors.cyan);
        doc.text('QUIET EYE BLUEPRINT', pageW / 2, y, { align: 'center' });

        y += 12;
        doc.setFontSize(16);
        setColor(colors.text);
        doc.text(trackName.toUpperCase(), pageW / 2, y, { align: 'center' });

        y += 8;
        doc.setFontSize(11);
        setColor(colors.muted);
        const subtitle = `${vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)} Protocol`;
        doc.text(subtitle + (clientName ? ` — ${clientName}` : ''), pageW / 2, y, { align: 'center' });

        y += 5;
        drawHLine(y, colors.cyan);

        // Track info
        y += 10;
        doc.setFontSize(10);
        setColor(colors.muted);
        const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        doc.text(`Generated: ${date}`, margin, y);
        doc.text(`Corners: ${corners.length}`, pageW - margin, y, { align: 'right' });

        if (trackData) {
            y += 6;
            if (trackData.length) doc.text(`Circuit Length: ${trackData.length}`, margin, y);
            if (trackData.direction) doc.text(`Direction: ${trackData.direction}`, pageW - margin, y, { align: 'right' });
        }

        // Overview section
        y += 14;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        setColor(colors.cyan);
        doc.text('GAZE PROTOCOL — 4-POINT MODEL', margin, y);

        y += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setColor(colors.text);

        const modelDesc = [
            '1. BRAKE MARKER VISIBLE — Eyes find the first visual reference for this corner on approach',
            '2. AT BRAKING — Eyes lock to braking reference, aware of apex geometry',
            '3. APEX — Eyes fixate the apex kerb/feature, aware of exit opening',
            '4. NEXT MARKER — Eyes search for the next corner reference, brain pre-loads next sequence'
        ];

        for (const line of modelDesc) {
            doc.text(line, margin + 2, y, { maxWidth: contentW - 4 });
            y += 6;
        }

        y += 4;
        doc.setFontSize(8);
        setColor(colors.muted);
        doc.text('Each pause point includes EYES (foveal target) and AWARE (peripheral awareness).', margin + 2, y);
        doc.text('5-second pause at each point during conditioning Laps 1-2.', margin + 2, y + 4);

        // ── Blueprint strategy (if available) ──
        if (blueprint?.overallStrategy) {
            y += 14;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            setColor(colors.orange);
            doc.text('OVERALL STRATEGY', margin, y);

            y += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            setColor(colors.text);
            const stratLines = doc.splitTextToSize(blueprint.overallStrategy, contentW - 4);
            doc.text(stratLines, margin + 2, y);
            y += stratLines.length * 4.5;
        }

        if (blueprint?.keyPrinciple) {
            y += 6;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            setColor(colors.green);
            doc.text('KEY PRINCIPLE:', margin, y);
            y += 5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            setColor(colors.text);
            const principleLines = doc.splitTextToSize(blueprint.keyPrinciple, contentW - 4);
            doc.text(principleLines, margin + 2, y);
            y += principleLines.length * 4.5;
        }

        // ══════════════════════════════════════════════
        //  CORNER-BY-CORNER PAGES
        // ══════════════════════════════════════════════

        for (let i = 0; i < corners.length; i++) {
            const corner = corners[i];
            doc.addPage();
            y = margin;

            // Dark background
            setFillColor(colors.dark);
            doc.rect(0, 0, pageW, pageH, 'F');

            // Corner header
            const dir = (corner.direction || 'right').toLowerCase();
            const dirColor = dir === 'left' ? colors.cyan : colors.orange;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            setColor(dirColor);
            doc.text(`${corner.number || i + 1}`, margin, y + 2);

            doc.setFontSize(14);
            setColor(colors.text);
            doc.text(corner.name || `Turn ${i + 1}`, margin + 12, y + 2);

            doc.setFontSize(10);
            setColor(colors.muted);
            const cornerDesc = `${dir.toUpperCase()} ${(corner.cornerType || corner.type || 'medium').toUpperCase()} — ${(corner.severity || 'medium').replace('_', ' ').toUpperCase()}`;
            doc.text(cornerDesc, pageW - margin, y + 2, { align: 'right' });

            y += 8;
            drawHLine(y, dirColor);
            y += 8;

            // Gaze sequence from blueprint
            const gazeSeq = blueprint?.corners?.[i]?.gazeSequence || corner.visualReferences || {};
            const phases = [
                { key: 'brakeMarkerVisible', label: 'BRAKE MARKER VISIBLE', color: colors.purple, icon: '1' },
                { key: 'brake', label: 'AT BRAKING', color: colors.orange, icon: '2' },
                { key: 'apex', label: 'APEX', color: colors.cyan, icon: '3' },
                { key: 'exit', label: 'EXIT', color: colors.green, icon: '4' },
                { key: 'nextMarker', label: 'NEXT MARKER', color: colors.purple, icon: '5' },
            ];

            for (const phase of phases) {
                const data = gazeSeq[phase.key];
                if (!data && phase.key !== 'brakeMarkerVisible' && phase.key !== 'nextMarker') continue;

                checkPage(28);

                // Phase card
                setFillColor(colors.cardBg);
                doc.roundedRect(margin, y, contentW, 22, 2, 2, 'F');

                // Phase label
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                setColor(phase.color);
                doc.text(`${phase.icon}  ${phase.label}`, margin + 4, y + 5);

                // Eyes target
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                setColor(colors.cyan);
                const eyesText = data?.eyes || (phase.key === 'brakeMarkerVisible' ? corner.visualReferences?.brakingReference : '') || '—';
                const eyesLines = doc.splitTextToSize(`Eyes: ${eyesText}`, contentW - 10);
                doc.text(eyesLines, margin + 4, y + 10);

                // Aware target
                setColor(colors.orange);
                const awareText = data?.aware || '—';
                const awareLines = doc.splitTextToSize(`Aware: ${awareText}`, contentW - 10);
                doc.text(awareLines, margin + 4, y + 15);

                y += 25;
            }

            // Timestamps
            const ts = corner.timestamps || {};
            if (ts.entry || ts.apex || ts.exit) {
                y += 4;
                doc.setFontSize(7);
                setColor(colors.muted);
                const tsText = [
                    ts.brakeMarkerVisible != null ? `Marker: ${ts.brakeMarkerVisible.toFixed(1)}s` : '',
                    ts.entry != null ? `Entry: ${ts.entry.toFixed(1)}s` : '',
                    ts.apex != null ? `Apex: ${ts.apex.toFixed(1)}s` : '',
                    ts.exit != null ? `Exit: ${ts.exit.toFixed(1)}s` : '',
                    ts.nextMarkerVisible != null ? `Next: ${ts.nextMarkerVisible.toFixed(1)}s` : '',
                ].filter(Boolean).join('   |   ');
                doc.text(tsText, margin, y);
                y += 5;
            }

            // Risk & QE Cue
            const riskData = blueprint?.corners?.[i];
            if (riskData?.quietEyeCue) {
                checkPage(20);
                y += 4;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                setColor(colors.green);
                doc.text('QUIET EYE CUE:', margin, y);
                y += 5;
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                setColor(colors.text);
                const cueLines = doc.splitTextToSize(`"${riskData.quietEyeCue}"`, contentW - 4);
                doc.text(cueLines, margin + 2, y);
                y += cueLines.length * 4.5;
            }

            if (riskData?.riskFactors?.length) {
                checkPage(20);
                y += 6;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                setColor(colors.red);
                doc.text('VAN RISK FACTORS:', margin, y);
                y += 4;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                setColor(colors.muted);
                for (const risk of riskData.riskFactors.slice(0, 3)) {
                    doc.text(`• ${risk}`, margin + 2, y);
                    y += 4;
                }
            }

            // Confidence
            if (corner.confidence) {
                y += 4;
                doc.setFontSize(7);
                setColor(colors.muted);
                doc.text(`Detection confidence: ${(corner.confidence * 100).toFixed(0)}%`, margin, y);
            }
        }

        // ══════════════════════════════════════════════
        //  TRAINING PROTOCOL PAGE
        // ══════════════════════════════════════════════

        if (blueprint?.trainingProtocol) {
            doc.addPage();
            y = margin;
            setFillColor(colors.dark);
            doc.rect(0, 0, pageW, pageH, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            setColor(colors.cyan);
            doc.text('TRAINING PROTOCOL', pageW / 2, y, { align: 'center' });

            y += 8;
            drawHLine(y, colors.cyan);
            y += 10;

            const tp = blueprint.trainingProtocol;

            doc.setFontSize(10);
            setColor(colors.text);
            doc.text(`Daily Duration: ${tp.dailyMinutes || 15} minutes`, margin, y);
            y += 8;

            if (tp.steps) {
                for (const step of tp.steps) {
                    checkPage(18);

                    setFillColor(colors.cardBg);
                    doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    setColor(colors.cyan);
                    doc.text(step.title, margin + 4, y + 5);

                    if (step.duration) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7);
                        setColor(colors.muted);
                        doc.text(step.duration, pageW - margin - 4, y + 5, { align: 'right' });
                    }

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);
                    setColor(colors.text);
                    const instrLines = doc.splitTextToSize(step.instruction, contentW - 10);
                    doc.text(instrLines, margin + 4, y + 10);

                    y += 16 + Math.max(0, (instrLines.length - 1) * 3.5);
                }
            }

            if (tp.weakCornerDrills) {
                checkPage(20);
                y += 6;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                setColor(colors.orange);
                doc.text('WEAK CORNER DRILLS', margin, y);
                y += 5;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                setColor(colors.text);
                const drillLines = doc.splitTextToSize(tp.weakCornerDrills, contentW - 4);
                doc.text(drillLines, margin + 2, y);
            }
        }

        // ── Footer on every page ──
        const totalPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 110);
            doc.text('Quiet Eye Blueprint — Generated by Lap Blueprint Generator', margin, pageH - 8);
            doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
        }

        // ── Save ──
        const fileName = `QE-Blueprint-${trackName.replace(/\s+/g, '-')}-${vehicleType}.pdf`;
        doc.save(fileName);

        return fileName;
    }
};
