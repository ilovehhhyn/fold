// Replaces the demo page with the private letter: a blank white page with the text exactly as it was written.

// The time the old page takes to fade out. It must equal the transition of `.demo__main` in demo.css.
const leaveDurationMs = 500;

export type LetterPageOptions = Readonly<{
	text: string;
	/** The part of the page that fades out and is then hidden. */
	leaving: HTMLElement;
	prefersReducedMotion: boolean;
	/** Called once the leaving part is hidden, so that its owner can release what it holds. */
	onLeft: () => void;
}>;

/** Fades the old page out and shows the letter in its place. */
export function showLetterPage(options: LetterPageOptions): void {
	const { leaving, onLeft, prefersReducedMotion, text } = options;
	const page = document.createElement("article");
	page.className = "letter";
	page.tabIndex = -1;
	page.setAttribute("aria-label", "A letter");
	const body = document.createElement("div");
	body.className = "letter__text";
	body.textContent = text;
	page.append(body);
	const swap = (): void => {
		leaving.hidden = true;
		onLeft();
		document.body.classList.add("demo--letter");
		document.body.dataset["view"] = "letter";
		document.body.append(page);
		window.scrollTo(0, 0);
		page.focus({ preventScroll: true });
		// The class arrives one frame later, so the browser draws the transparent page first and the fade runs.
		requestAnimationFrame(() => {
			page.classList.add("letter--shown");
		});
	};
	if (prefersReducedMotion) {
		swap();
		return;
	}
	leaving.classList.add("demo__main--leaving");
	window.setTimeout(swap, leaveDurationMs);
}
