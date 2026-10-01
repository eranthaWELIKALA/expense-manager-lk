// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(() => { cleanup(); document.body.style.overflow = ""; });

function Stack() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <>
      <button onClick={() => setInner(false)}>close inner</button>
      <button onClick={() => setOuter(false)}>close outer</button>
      {outer && <Modal title="Outer" onClose={() => setOuter(false)}>a</Modal>}
      {inner && <Modal title="Inner" onClose={() => setInner(false)}>b</Modal>}
    </>
  );
}

describe("Modal scroll lock", () => {
  it("locks body scroll while any dialog is open and restores it after the last closes", () => {
    document.body.style.overflow = "auto";
    render(<Stack />);
    expect(document.body.style.overflow).toBe("hidden");

    act(() => screen.getByText("close inner").click());
    expect(screen.queryByRole("dialog", { name: "Inner" })).toBeNull();
    expect(document.body.style.overflow).toBe("hidden"); // outer still open

    act(() => screen.getByText("close outer").click());
    expect(document.body.style.overflow).toBe("auto"); // original value restored
  });
});
