// Small canvas-native accents use the same two-texel grid as the source artwork.
// Keep them small: the existing painted environment remains the visual foundation.
export const DETAILS = {
	waymarker: { width: 28, height: 32, paint: paintWaymarker },
	pierPost: { width: 8, height: 18, paint: paintPierPost },
	fender: { width: 5, height: 12, paint: paintFender },
	tackle: { width: 25, height: 33, paint: paintTackle }
} as const;
export type Detail = keyof typeof DETAILS;

function paintWaymarker(c: CanvasRenderingContext2D) {
	c.fillStyle = "#45372a";
	c.fillRect(12, 5, 5, 27);
	c.fillStyle = "#84633e";
	c.fillRect(13, 7, 3, 24);
	c.fillStyle = "#be9760";
	c.fillRect(13, 20, 1, 9);
	c.fillStyle = "#52432e";
	c.fillRect(2, 3, 22, 9);
	c.fillRect(24, 5, 2, 5);
	c.fillRect(26, 6, 1, 3);
	c.fillRect(3, 14, 22, 9);
	c.fillRect(1, 16, 2, 5);
	c.fillRect(0, 17, 1, 3);
	c.fillStyle = "#a57d49";
	c.fillRect(3, 4, 20, 7);
	c.fillRect(23, 6, 2, 3);
	c.fillRect(4, 15, 20, 7);
	c.fillRect(2, 17, 2, 3);
	c.fillStyle = "#d3af72";
	c.fillRect(3, 4, 19, 1);
	c.fillRect(5, 15, 19, 1);
	c.fillStyle = "#775936";
	c.fillRect(4, 10, 18, 0.5);
	c.fillRect(5, 21, 18, 0.5);
	c.fillRect(4, 6, 3, 0.5);
	c.fillRect(17, 18, 6, 0.5);
	// Fish silhouette points toward the lake; a sprout marks the garden route.
	c.fillStyle = "#f0d8a0";
	c.fillRect(10, 6, 7, 3);
	c.fillRect(12, 5, 3, 5);
	c.fillRect(8, 5.5, 1, 4);
	c.fillRect(9, 6.5, 1, 2);
	c.fillStyle = "#614d34";
	c.fillRect(16, 6.5, 0.5, 0.5);
	c.fillStyle = "#dfd5a0";
	c.fillRect(12, 17, 1, 4);
	c.fillRect(9, 16, 3, 2);
	c.fillRect(13, 16, 3, 2);
	c.fillRect(10, 18, 2, 1);
	c.fillRect(13, 18, 2, 1);
	c.fillStyle = "#e3c28a";
	for (const [x, y] of [
		[5, 7],
		[21, 8],
		[6, 19],
		[22, 17]
	]) {
		c.fillRect(x, y, 0.5, 0.5);
		c.fillStyle = "#514534";
		c.fillRect(x, y + 0.5, 0.5, 0.5);
		c.fillStyle = "#e3c28a";
	}
	// Moss along the foot seats the post in the bank.
	c.fillStyle = "#50643b";
	c.fillRect(10, 30, 9, 2);
	c.fillRect(11, 28, 1, 3);
	c.fillStyle = "#8a9851";
	c.fillRect(17, 29, 1, 2);
}

function paintPierPost(c: CanvasRenderingContext2D) {
	c.fillStyle = "#45352b";
	c.fillRect(1, 4, 6, 13);
	c.fillRect(2, 17, 4, 1);
	c.fillStyle = "#976b40";
	c.fillRect(2, 4, 4, 12);
	c.fillStyle = "#c39458";
	c.fillRect(2, 5, 1, 11);
	c.fillStyle = "#654d34";
	c.fillRect(5, 5, 1, 10);
	c.fillRect(3.5, 11, 0.5, 3);
	c.fillStyle = "#d1aa6e";
	c.fillRect(1, 2, 6, 3);
	c.fillRect(2, 1, 4, 1);
	c.fillStyle = "#a57c4c";
	c.fillRect(2, 3, 4, 1);
	c.fillStyle = "#785b3d";
	c.fillRect(3, 2, 2, 0.5);
	c.fillStyle = "#564c38";
	c.fillRect(1, 7, 6, 3);
	c.fillStyle = "#c9b488";
	c.fillRect(1, 7, 6, 0.5);
	c.fillRect(1, 8.5, 6, 0.5);
	c.fillStyle = "#e1cd9e";
	c.fillRect(2, 7.5, 1, 1);
}

function paintTackle(c: CanvasRenderingContext2D) {
	// Slender bamboo rod and slack line, with a small cork float.
	c.strokeStyle = "#4a3b28";
	c.lineWidth = 1.5;
	c.beginPath();
	c.moveTo(4, 29);
	c.lineTo(18, 2);
	c.stroke();
	c.strokeStyle = "#d4ad65";
	c.lineWidth = 0.5;
	c.stroke();
	c.strokeStyle = "#c3c5a7";
	c.beginPath();
	c.moveTo(18, 2);
	c.lineTo(21, 8);
	c.lineTo(23, 23);
	c.stroke();
	c.fillStyle = "#ecce97";
	c.fillRect(22, 23, 1.5, 2);
	c.fillStyle = "#b76745";
	c.fillRect(22, 25, 1.5, 1);
	c.fillStyle = "#74634a";
	c.fillRect(6, 23, 3, 3);
	c.fillStyle = "#d5bf8e";
	c.fillRect(7, 23.5, 1, 1.5);
	// Banded wooden pail, a dark open mouth, and a few water highlights.
	c.fillStyle = "#423b2e";
	c.fillRect(3, 25, 9, 6);
	c.fillRect(4, 31, 7, 1);
	c.fillStyle = "#ad8251";
	c.fillRect(4, 26, 7, 5);
	c.fillStyle = "#d0a46b";
	c.fillRect(4, 26, 1, 4);
	c.fillRect(7, 27, 0.5, 3);
	c.fillStyle = "#645c49";
	c.fillRect(3, 26, 9, 1);
	c.fillRect(4, 29, 7, 1);
	c.fillStyle = "#c9b78b";
	c.fillRect(3, 24, 9, 1);
	c.fillStyle = "#344e4b";
	c.fillRect(4, 24.5, 7, 1);
	c.fillStyle = "#7eaaa1";
	c.fillRect(5, 24.5, 3, 0.5);
	// Rope is an irregular elliptical coil, with a loose end toward the cleat.
	c.lineWidth = 1;
	c.strokeStyle = "#5f4b32";
	c.beginPath();
	c.ellipse(17, 30, 4.5, 2, -0.1, 0, Math.PI * 2);
	c.stroke();
	c.strokeStyle = "#c2a671";
	c.beginPath();
	c.ellipse(17, 29.5, 4, 1.5, -0.1, 0, Math.PI * 2);
	c.ellipse(17, 29.5, 2, 0.6, -0.1, 0, Math.PI * 2);
	c.moveTo(20, 30);
	c.lineTo(23, 29);
	c.lineTo(24, 27);
	c.stroke();
}

function paintFender(c: CanvasRenderingContext2D) {
	c.fillStyle = "#594d36";
	c.fillRect(2, 0, 1, 3);
	c.fillRect(1, 3, 3, 8);
	c.fillRect(0.5, 5, 4, 4);
	c.fillStyle = "#aa9468";
	c.fillRect(1, 4, 3, 6);
	c.fillRect(1.5, 10, 2, 1);
	c.fillStyle = "#dbc999";
	c.fillRect(1, 4, 1, 5);
	c.fillStyle = "#78684a";
	for (let y = 4; y < 10; y += 1.5) c.fillRect(1, y, 3, 0.5);
	c.fillStyle = "#ebd9aa";
	c.fillRect(1.5, 3.5, 1.5, 0.5);
	c.fillRect(2, 0, 0.5, 2);
}
