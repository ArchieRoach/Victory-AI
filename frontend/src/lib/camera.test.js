import { cameraConstraints, ultraWideId } from "./camera";
import { creatorMode, setCreatorMode, videoShape, setVideoShape } from "./trainingPrefs";

test("rounds record in portrait 9:16 unless landscape is chosen", () => {
  const p = cameraConstraints("user");
  expect(p.width.ideal).toBe(1080);
  expect(p.height.ideal).toBe(1920);
  expect(p.aspectRatio.ideal).toBeCloseTo(9 / 16);
  expect(cameraConstraints("user", "landscape").aspectRatio.ideal).toBeCloseTo(16 / 9);
  expect(cameraConstraints("environment", "portrait", "abc").deviceId).toEqual({ exact: "abc" });
});

test("the ultra-wide back lens is found by name", () => {
  const devices = [
    { kind: "videoinput", label: "Front Camera", deviceId: "f" },
    { kind: "videoinput", label: "Back Camera", deviceId: "b" },
    { kind: "videoinput", label: "Back Ultra Wide Camera", deviceId: "uw" },
  ];
  expect(ultraWideId(devices)).toBe("uw");
  expect(ultraWideId(devices.slice(0, 2))).toBeNull();
});

test("Creator Mode and portrait are the defaults and only change when chosen", () => {
  localStorage.clear();
  expect(creatorMode()).toBe(true);
  expect(videoShape()).toBe("portrait");
  setCreatorMode(false);
  setVideoShape("landscape");
  expect(creatorMode()).toBe(false);
  expect(videoShape()).toBe("landscape");
  localStorage.clear();
});
