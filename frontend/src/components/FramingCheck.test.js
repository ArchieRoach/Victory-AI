import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { FramingCheck } from "./FramingCheck";

test("in frame for a moment starts a 3-2-1, then the round, once, even while the page re-renders", () => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const div = document.createElement("div");
  document.body.appendChild(div);
  const root = createRoot(div);
  const onStart = jest.fn();
  const draw = () => root.render(<FramingCheck videoRef={{ current: null }} framing="ok" onStart={() => onStart()} onCancel={() => {}} />);
  act(() => draw());
  for (let i = 0; i < 40; i += 1) {
    act(() => { jest.advanceTimersByTime(150); draw(); });
  }
  expect(onStart).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  jest.useRealTimers();
});

test("out of frame never starts by itself", () => {
  jest.useFakeTimers();
  const div = document.createElement("div");
  const root = createRoot(div);
  const onStart = jest.fn();
  act(() => root.render(<FramingCheck videoRef={{ current: null }} framing="back" onStart={onStart} onCancel={() => {}} />));
  act(() => { jest.advanceTimersByTime(10000); });
  expect(onStart).not.toHaveBeenCalled();
  expect(div.textContent).toContain("Step back");
  act(() => root.unmount());
  jest.useRealTimers();
});
