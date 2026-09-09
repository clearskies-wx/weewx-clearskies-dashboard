import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { HorizontalScrollNav } from './horizontal-scroll-nav';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => ({ scrollLeft: 'Localized left', scrollRight: 'Localized right' })[key] ?? key }) }));

const originalResizeObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
const originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollBy');

afterEach(() => {
  if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver;
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  if (originalScrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
  if (originalScrollBy) Object.defineProperty(HTMLElement.prototype, 'scrollBy', originalScrollBy);
});

describe('HorizontalScrollNav', () => {
  it('uses localized accessible labels for rendered scroll controls', () => {
    class ResizeObserverMock { observe() {} disconnect() {} }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 200 });
    const scrollBy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: scrollBy });

    const { getByRole } = render(<HorizontalScrollNav ariaLabel="Forecast"><div>Forecast content</div></HorizontalScrollNav>);
    fireEvent.click(getByRole('button', { name: 'Localized right' }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 80, behavior: 'smooth' });
  });
});
