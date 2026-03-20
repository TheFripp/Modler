/**
 * Svelte action for drag-to-scrub numeric value adjustment.
 *
 * Attach to a container element. On hover, cursor becomes ns-resize.
 * Click (no drag) focuses the <input> inside for typing.
 * Click + drag scrubs the numeric value up/down.
 *
 * Usage:
 *   <div use:dragScrub={{ value, step, min, max, onScrub, onScrubEnd }}>
 */

export interface DragScrubOptions {
	/** Current numeric value */
	value: number;
	/** Step size per drag unit (default: 0.1) */
	step?: number;
	/** Minimum allowed value */
	min?: number;
	/** Maximum allowed value */
	max?: number;
	/** Pixels of mouse movement per step unit (default: 4). Lower = faster. */
	sensitivity?: number;
	/** Called when scrub begins (mouse held + moved) */
	onScrubStart?: () => void;
	/** Called during drag with full-precision constrained value */
	onScrub?: (value: number) => void;
	/** Called when drag ends with display-rounded value */
	onScrubEnd?: (value: number) => void;
	/** Whether scrubbing is disabled */
	disabled?: boolean;
}

export function dragScrub(node: HTMLElement, options: DragScrubOptions) {
	let opts = options;
	let isDragging = false;
	let dragStartTimeout: ReturnType<typeof setTimeout> | null = null;
	let startY = 0;
	let startValue = 0;
	let currentValue = 0;

	// Set ns-resize cursor on the container
	if (!opts.disabled) node.style.cursor = 'ns-resize';

	function handleMouseDown(e: MouseEvent) {
		if (opts.disabled) return;

		const target = e.target as HTMLElement;

		// If clicking a focused input, let the user type
		if (target.tagName === 'INPUT' && document.activeElement === target) return;

		// Don't intercept button clicks (fill button, etc.)
		if (target.closest('button')) return;

		// Prevent input focus until we know it's a click (not a drag)
		e.preventDefault();

		// Capture starting state
		startY = e.clientY;
		startValue = opts.value;
		currentValue = opts.value;

		// 150ms to distinguish click from drag
		dragStartTimeout = setTimeout(() => {
			startScrubbing();
		}, 150);

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	function startScrubbing() {
		if (isDragging) return;
		isDragging = true;
		dragStartTimeout = null;
		document.body.style.cursor = 'ns-resize';
		document.body.style.userSelect = 'none';

		// Blur any focused input to prevent conflicting updates
		const input = node.querySelector('input');
		if (input && document.activeElement === input) {
			(input as HTMLInputElement).blur();
		}

		opts.onScrubStart?.();
	}

	function handleMouseMove(e: MouseEvent) {
		// Start scrubbing early if moved enough before timeout
		if (!isDragging) {
			if (Math.abs(e.clientY - startY) > 3) {
				if (dragStartTimeout) {
					clearTimeout(dragStartTimeout);
				}
				startScrubbing();
			}
			return;
		}

		const deltaY = startY - e.clientY; // Inverted: drag up = increase
		const step = opts.step ?? 0.1;
		const sensitivity = opts.sensitivity ?? 4;
		const rawValue = startValue + (deltaY / sensitivity) * step;

		// Apply constraints
		let constrained = rawValue;
		if (opts.min !== undefined) constrained = Math.max(constrained, opts.min);
		if (opts.max !== undefined) constrained = Math.min(constrained, opts.max);

		currentValue = constrained;
		opts.onScrub?.(constrained);
	}

	function handleMouseUp() {
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('mouseup', handleMouseUp);

		if (dragStartTimeout) {
			clearTimeout(dragStartTimeout);
			dragStartTimeout = null;
		}

		if (isDragging) {
			isDragging = false;
			document.body.style.cursor = '';
			document.body.style.userSelect = '';

			// Round final value for display precision
			const step = opts.step ?? 0.1;
			const finalValue = step >= 1
				? Math.round(currentValue)
				: Math.round(currentValue * 10) / 10;

			opts.onScrubEnd?.(finalValue);
		} else {
			// Was a click — focus the input inside
			const input = node.querySelector('input') as HTMLInputElement | null;
			if (input) {
				input.focus();
				input.select();
			}
		}
	}

	node.addEventListener('mousedown', handleMouseDown);

	return {
		update(newOptions: DragScrubOptions) {
			opts = newOptions;
			node.style.cursor = opts.disabled ? '' : 'ns-resize';
		},
		destroy() {
			node.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			if (dragStartTimeout) clearTimeout(dragStartTimeout);
			node.style.cursor = '';
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		}
	};
}
