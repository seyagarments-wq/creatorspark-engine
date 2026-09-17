import { describe, it, expect } from "vitest";
import { takePickedFiles } from "../file-picker";

// Mimics a browser file input: its `files` list is a live object that the
// browser empties in place when `value` is set to "".
function fakeInput(...files: File[]) {
  const live: File[] = [...files];
  const input = {
    files: live as unknown as FileList,
    _value: "C:\\fakepath\\x",
    get value() {
      return this._value;
    },
    set value(v: string) {
      this._value = v;
      if (v === "") live.length = 0;
    },
  };
  return input;
}

const clip = new File([new Uint8Array(4)], "do my lashes w me - captions.mov", { type: "video/quicktime" });

describe("takePickedFiles", () => {
  it("keeps the picked files even though resetting the input empties its live list", () => {
    const input = fakeInput(clip);
    const picked = takePickedFiles(input.files, input);
    expect(input.value).toBe("");
    expect((input.files as unknown as File[]).length).toBe(0); // the browser behaviour
    expect(picked).toHaveLength(1); // what the handler must still see
    expect(picked[0].name).toBe(clip.name);
  });

  it("reproduces the old bug ordering for the record: reset first loses the file", () => {
    const input = fakeInput(clip);
    input.value = "";
    expect(Array.from(input.files)).toHaveLength(0);
  });

  it("handles a drop list and a missing input", () => {
    const dropList = [clip, clip];
    expect(takePickedFiles(dropList, null)).toHaveLength(2);
    expect(takePickedFiles(null, fakeInput())).toEqual([]);
    expect(takePickedFiles(undefined, undefined)).toEqual([]);
  });
});
