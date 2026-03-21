import { describe, expect, it, vi } from "vitest";
import {
  applyOutputSideEffects,
  shouldGenerateHtmlReport,
  shouldPersistHistory,
  type OutputMode,
} from "./cli-output.js";

describe("cli output behavior", () => {
  const machineReadableModes: OutputMode[] = ["json", "sarif", "pr-summary"];

  it("does not persist history for machine-readable modes", () => {
    for (const mode of machineReadableModes) {
      expect(shouldPersistHistory(mode)).toBe(false);
    }
  });

  it("persists history for interactive terminal scans only", () => {
    expect(shouldPersistHistory("terminal")).toBe(true);
    expect(shouldPersistHistory("score")).toBe(false);
  });

  it("only generates HTML reports for interactive terminal scans", () => {
    expect(shouldGenerateHtmlReport("terminal")).toBe(true);
    expect(shouldGenerateHtmlReport("score")).toBe(false);
    expect(shouldGenerateHtmlReport("json")).toBe(false);
    expect(shouldGenerateHtmlReport("sarif")).toBe(false);
    expect(shouldGenerateHtmlReport("pr-summary")).toBe(false);
  });

  it("does not call history or report hooks for machine-readable modes", () => {
    const appendHistory = vi.fn();
    const generateHtmlReport = vi.fn();
    const printReportLink = vi.fn();

    for (const mode of machineReadableModes) {
      applyOutputSideEffects(mode, {
        appendHistory,
        generateHtmlReport,
        printReportLink,
      });
    }

    expect(appendHistory).not.toHaveBeenCalled();
    expect(generateHtmlReport).not.toHaveBeenCalled();
    expect(printReportLink).not.toHaveBeenCalled();
  });

  it("runs history and report hooks for terminal mode", () => {
    const appendHistory = vi.fn();
    const generateHtmlReport = vi.fn(() => "/tmp/report.html");
    const printReportLink = vi.fn();

    const reportPath = applyOutputSideEffects("terminal", {
      appendHistory,
      generateHtmlReport,
      printReportLink,
    });

    expect(appendHistory).toHaveBeenCalledOnce();
    expect(generateHtmlReport).toHaveBeenCalledOnce();
    expect(printReportLink).toHaveBeenCalledWith("/tmp/report.html");
    expect(reportPath).toBe("/tmp/report.html");
  });
});
