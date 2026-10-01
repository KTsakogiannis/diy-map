document.addEventListener('DOMContentLoaded', () => {
	const points = document.querySelector('#points');
	const canvas = document.querySelector('#map');
	const mapCard = document.querySelector('.map-card');
	const paperSizeInput = document.querySelector('#paperSize');
	const context = canvas.getContext('2d');
	const printStyle = document.createElement('style');
	const paperSizes = {
		A5: { width: 148, height: 210 },
		A4: { width: 210, height: 297 },
		A3: { width: 297, height: 420 }
	};
	const printMargin = 12;
	printStyle.id = 'print-page-size';
	document.head.appendChild(printStyle);
	let legs = [{ azimuth: 45, distance: 100 }];
	const northSymbol = new Image();
	northSymbol.addEventListener('load', () => update());
	northSymbol.src = 'north-symbol-icon.png';

	const format = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
	const pointName = (index) => String.fromCharCode(65 + index);

	function standardScaleDistance(pixelsPerMeter) {
		const targetDistance = 120 / Math.max(pixelsPerMeter, 0.000001);
		const power = 10 ** Math.floor(Math.log10(targetDistance));
		const normalized = targetDistance / power;
		const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
		return step * power;
	}

	function getPaperLayout(width, height) {
		const paper = paperSizes[paperSizeInput.value];
		const landscape = width > height;
		return {
			width: landscape ? paper.height : paper.width,
			height: landscape ? paper.width : paper.height,
			landscape
		};
	}

	function getScaleDenominator(width, height, paperWidth, paperHeight) {
		const usableWidth = paperWidth - printMargin * 2;
		const usableHeight = paperHeight - printMargin * 2;
		const required = Math.max(width * 1000 / usableWidth, height * 1000 / usableHeight, 1);
		const preferredSteps = [10, 15, 20, 25, 30, 40, 50];
		let powerOfTen = 1;
		while (preferredSteps[preferredSteps.length - 1] * powerOfTen < required) powerOfTen *= 10;
		return preferredSteps.map((step) => step * powerOfTen).find((denominator) => denominator >= required);
	}

	function updatePrintPage(layout) {
		const orientation = layout.landscape ? 'landscape' : 'portrait';
		printStyle.textContent = `@page { size: ${paperSizeInput.value} ${orientation}; margin: 0; }`;
		document.querySelector('#orientation').textContent = layout.landscape ? 'Landscape' : 'Portrait';
	}

	function renderInputs() {
		points.innerHTML = legs.map((leg, index) => `
			<div class="leg">
				<label>Leg ${index + 1}: ${pointName(index)} to ${pointName(index + 1)}<input class="azimuth" type="number" min="0" max="360" step="any" value="${leg.azimuth}" aria-label="Leg ${index + 1} azimuth"></label>
				<label>Distance (m)<input class="distance" type="number" min="0" step="any" value="${leg.distance}" aria-label="Leg ${index + 1} distance"></label>
				<button class="remove" title="Remove leg" data-index="${index}">x</button>
			</div>`).join('');

		points.querySelectorAll('input').forEach((input, index) => {
			input.addEventListener('input', () => {
				const leg = legs[Math.floor(index / 2)];
				leg[index % 2 === 0 ? 'azimuth' : 'distance'] = Number(input.value);
				update();
			});
		});

		points.querySelectorAll('.remove').forEach((button) => {
			button.addEventListener('click', () => {
				if (legs.length > 1) {
					legs.splice(Number(button.dataset.index), 1);
					renderInputs();
					update();
				}
			});
		});
	}

	function update() {
		const pointsData = [{ x: 0, y: 0 }];
		const calculatedLegs = [];
		let total = 0;
		legs.forEach((leg, index) => {
			const validAzimuth = Number.isFinite(leg.azimuth) && leg.azimuth >= 0 && leg.azimuth <= 360;
			const validDistance = Number.isFinite(leg.distance) && leg.distance >= 0;
			if (!validAzimuth || !validDistance) {
				calculatedLegs.push({ number: index + 1, from: pointName(index), to: pointName(index + 1), valid: false });
				pointsData.push({ ...pointsData[index] });
				return;
			}
			const radians = (leg.azimuth % 360) * Math.PI / 180;
			const previousPoint = pointsData[index];
			const point = {
				x: previousPoint.x + leg.distance * Math.sin(radians),
				y: previousPoint.y + leg.distance * Math.cos(radians)
			};
			pointsData.push(point);
			total += leg.distance;
			calculatedLegs.push({ number: index + 1, from: pointName(index), to: pointName(index + 1), azimuth: leg.azimuth % 360, distance: leg.distance, valid: true });
		});

		const xValues = pointsData.map((point) => point.x);
		const yValues = pointsData.map((point) => point.y);
		const width = Math.max(...xValues) - Math.min(...xValues);
		const height = Math.max(...yValues) - Math.min(...yValues);
		const layout = getPaperLayout(width, height);
		const denominator = getScaleDenominator(width, height, layout.width, layout.height);
		mapCard.classList.toggle('landscape', layout.landscape);
		updatePrintPage(layout);
		document.querySelector('#total').textContent = `${format(total)} m`;
		document.querySelector('#legs').textContent = calculatedLegs.filter((leg) => leg.valid).length;
		document.querySelector('#ratio').textContent = `1:${denominator}`;
		document.querySelector('#summaryRatio').textContent = `1:${denominator}`;
		document.querySelector('#results').innerHTML = calculatedLegs.map((leg) => leg.valid
			? `<tr><td>${leg.number}</td><td>${leg.from} -> ${leg.to}</td><td>${format(leg.azimuth)}°</td><td>${format(leg.distance)} m</td></tr>`
			: `<tr><td>${leg.number}</td><td>${leg.from} -> ${leg.to}</td><td colspan="2">Enter a valid azimuth and distance</td></tr>`).join('');
		draw(pointsData, xValues, yValues, width, height, layout, denominator);
	}

	function draw(pointsData, xValues, yValues, width, height, layout, denominator) {
		const bounds = canvas.getBoundingClientRect();
		const pixelRatio = window.devicePixelRatio || 1;
		canvas.width = bounds.width * pixelRatio;
		canvas.height = bounds.height * pixelRatio;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		const canvasWidth = bounds.width;
		const canvasHeight = bounds.height;
		const pixelsPerMillimetre = canvasWidth / layout.width;
		const scale = pixelsPerMillimetre * 1000 / denominator;
		const padding = printMargin * pixelsPerMillimetre;
		const originX = padding + (canvasWidth - padding * 2 - width * scale) / 2 - Math.min(...xValues) * scale;
		const originY = padding + (canvasHeight - padding * 2 - height * scale) / 2 + Math.max(...yValues) * scale;
		const minimumX = Math.min(...xValues);
		const maximumY = Math.max(...yValues);
		const screenPoints = pointsData.map((point) => ({
			x: originX + point.x * scale,
			y: originY - point.y * scale
		}));
		context.clearRect(0, 0, canvasWidth, canvasHeight);
		context.strokeStyle = '#f2c9aa';
		context.lineWidth = 0.7;
		for (let millimetre = 1; millimetre < layout.width; millimetre += 1) {
			if (millimetre % 10 === 0) continue;
			const x = millimetre * pixelsPerMillimetre;
			context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvasHeight); context.stroke();
		}
		for (let millimetre = 1; millimetre < layout.height; millimetre += 1) {
			if (millimetre % 10 === 0) continue;
			const y = millimetre * pixelsPerMillimetre;
			context.beginPath(); context.moveTo(0, y); context.lineTo(canvasWidth, y); context.stroke();
		}
		context.strokeStyle = '#d99d70';
		context.lineWidth = 1.6;
		for (let millimetre = 0; millimetre <= layout.width; millimetre += 10) {
			const x = millimetre * pixelsPerMillimetre;
			context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvasHeight); context.stroke();
		}
		for (let millimetre = 0; millimetre <= layout.height; millimetre += 10) {
			const y = millimetre * pixelsPerMillimetre;
			context.beginPath(); context.moveTo(0, y); context.lineTo(canvasWidth, y); context.stroke();
		}
		context.strokeStyle = '#177d8d';
		context.lineWidth = 3;
		context.beginPath();
		screenPoints.forEach((point, index) => {
			if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
		});
		context.stroke();
		screenPoints.forEach((screenPoint, index) => {
			const point = pointsData[index];
			const x = screenPoint.x;
			const y = screenPoint.y;
			context.fillStyle = index === 0 ? '#e35d3f' : '#177d8d';
			context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill();
			const previous = pointsData[index - 1];
			const next = pointsData[index + 1];
			let awayX = (previous ? point.x - previous.x : point.x - next.x) + (next ? point.x - next.x : 0);
			let awayY = (previous ? point.y - previous.y : point.y - next.y) + (next ? point.y - next.y : 0);
			if (awayX === 0 && awayY === 0 && previous && next) {
				awayX = -(next.y - previous.y);
				awayY = next.x - previous.x;
			}
			const awayLength = Math.hypot(awayX, awayY) || 1;
			const labelX = x + (awayX / awayLength) * 14;
			const labelY = y - (awayY / awayLength) * 14;
			context.fillStyle = '#123b52'; context.font = '12px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(pointName(index), labelX, labelY);
		});
		context.textAlign = 'start'; context.textBaseline = 'alphabetic';
		drawMapLegend(scale, pixelsPerMillimetre, canvasWidth, canvasHeight, padding, denominator);
	}

	function drawMapLegend(pixelsPerMeter, pixelsPerMillimetre, canvasWidth, canvasHeight, padding, denominator) {
		const scaleDistance = standardScaleDistance(pixelsPerMeter);
		const nominalBarWidth = scaleDistance * pixelsPerMeter;
		const barHeight = Math.max(4, pixelsPerMillimetre * 3);
		const textSize = Math.max(10, pixelsPerMillimetre * 3.1);
		const iconSize = pixelsPerMillimetre * 10;
		const innerPadding = pixelsPerMillimetre * 3;
		const details = [
			['Name', document.querySelector('#mapName').value.trim() || '-'],
			['Date', document.querySelector('#mapDate').value || '-'],
			['Place', document.querySelector('#mapPlace').value.trim() || '-']
		];
		context.save();
		context.font = `${textSize}px system-ui`;
		const detailWidths = details.map((detail) => context.measureText(`${detail[0]}: ${detail[1]}`).width);
		const scaleTextWidth = context.measureText(`Scale 1:${denominator}`).width;
		const graphicalScaleWidth = iconSize + pixelsPerMillimetre * 5 + Math.max(scaleTextWidth, nominalBarWidth);
		const availableLegendWidth = canvasWidth - padding * 2;
		const legendWidth = Math.min(Math.max(...detailWidths, graphicalScaleWidth) + innerPadding * 2, availableLegendWidth);
		const detailMaxWidth = Math.max(1, legendWidth - innerPadding * 2);
		const maxBarWidth = Math.max(pixelsPerMillimetre * 10, legendWidth - innerPadding * 2 - iconSize - pixelsPerMillimetre * 5);
		const barWidth = Math.min(nominalBarWidth, maxBarWidth);
		const displayedScaleDistance = barWidth / pixelsPerMeter;
		const wrapText = (text) => {
			const words = text.split(' ');
			const lines = [];
			let line = '';
			words.forEach((word) => {
				const candidate = line ? `${line} ${word}` : word;
				if (line && context.measureText(candidate).width > detailMaxWidth) {
					lines.push(line);
					line = word;
				} else {
					line = candidate;
				}
			});
			if (line) lines.push(line);
			return lines.length ? lines : ['-'];
		};
		const wrappedDetails = details.map((detail) => wrapText(`${detail[0]}: ${detail[1]}`));
		const metadataLineHeight = Math.max(pixelsPerMillimetre * 5, textSize * 1.35);
		const metadataTop = innerPadding + pixelsPerMillimetre * 2;
		const metadataHeight = wrappedDetails.reduce((height, lines) => height + lines.length * metadataLineHeight, 0);
		const scaleSectionY = metadataTop + metadataHeight + pixelsPerMillimetre * 2;
		const graphicalLabelOffset = pixelsPerMillimetre * 3;
		const arithmeticScaleOffset = pixelsPerMillimetre * 4;
		const graphicalLabelY = pixelsPerMillimetre * 8 + barHeight + graphicalLabelOffset;
		const northIconHeight = graphicalLabelY - arithmeticScaleOffset;
		const legendHeight = scaleSectionY + Math.max(northIconHeight, graphicalLabelY + textSize) + innerPadding;
		const legendX = canvasWidth - padding - legendWidth;
		const legendY = canvasHeight - padding - legendHeight;
		const symbolX = legendX + innerPadding;
		const symbolY = legendY + scaleSectionY + arithmeticScaleOffset;
		const barX = symbolX + iconSize + pixelsPerMillimetre * 5;
		const barY = legendY + scaleSectionY + pixelsPerMillimetre * 8;
		context.fillStyle = 'rgba(255, 255, 255, 0.94)';
		context.fillRect(legendX, legendY, legendWidth, legendHeight);
		context.strokeStyle = '#17212b';
		context.lineWidth = Math.max(1, pixelsPerMillimetre * 0.35);
		context.strokeRect(legendX, legendY, legendWidth, legendHeight);
		context.fillStyle = '#17212b';
		let metadataOffset = 0;
		wrappedDetails.forEach((lines) => {
			lines.forEach((line) => {
				context.fillText(line, legendX + innerPadding, legendY + metadataTop + metadataOffset);
				metadataOffset += metadataLineHeight;
			});
		});
		if (northSymbol.complete && northSymbol.naturalWidth > 0) context.drawImage(northSymbol, symbolX, symbolY, iconSize, northIconHeight);
		context.font = `bold ${textSize}px system-ui`;
		context.fillText(`Scale 1:${denominator}`, barX, symbolY);
		for (let segment = 0; segment < 5; segment += 1) {
			context.fillStyle = segment % 2 === 0 ? '#17212b' : '#ffffff';
			context.fillRect(barX + segment * (barWidth / 5), barY, barWidth / 5, barHeight);
		}
		context.strokeStyle = '#17212b';
		context.lineWidth = Math.max(1, pixelsPerMillimetre * 0.35);
		context.strokeRect(barX, barY, barWidth, barHeight);
		context.fillStyle = '#17212b';
		context.font = `${textSize}px system-ui`;
		context.fillText(`${format(displayedScaleDistance)} m`, barX, legendY + scaleSectionY + graphicalLabelY);
		context.restore();
	}

	document.querySelector('#add').addEventListener('click', () => {
		legs.push({ azimuth: 0, distance: 100 });
		renderInputs();
		update();
	});
	document.querySelector('#clear').addEventListener('click', () => {
		legs = [{ azimuth: 45, distance: 100 }];
		renderInputs();
		update();
	});
	paperSizeInput.addEventListener('change', update);
	document.querySelectorAll('#mapName, #mapDate, #mapPlace').forEach((input) => input.addEventListener('input', update));
	document.querySelector('#export').addEventListener('click', () => {
		update();
		window.print();
	});
	window.addEventListener('beforeprint', update);
	window.addEventListener('afterprint', update);
	window.addEventListener('resize', update);
	renderInputs();
	update();
});
