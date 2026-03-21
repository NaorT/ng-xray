import { describe, it, expect } from "vitest";
import { buildProjectClassMap } from "./inheritance-resolver.js";
import { fixtureDir } from "../__fixtures__/helper.js";

describe("buildProjectClassMap", () => {
  it("detects @Component classes", () => {
    const { classes } = buildProjectClassMap(fixtureDir("clean-project"));
    const componentClasses = [...classes.values()].filter((c) => c.isComponent);
    expect(componentClasses.length).toBeGreaterThanOrEqual(1);
  });

  it("detects @Injectable classes", () => {
    const { classes } = buildProjectClassMap(fixtureDir("unused-service"));
    const serviceClasses = [...classes.values()].filter((c) => c.isService);
    expect(serviceClasses.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts class members", () => {
    const { classes } = buildProjectClassMap(fixtureDir("heavy-constructor"));
    const heavyClass = [...classes.values()].find((c) => c.name === "HeavyComponent");
    expect(heavyClass).toBeDefined();
    expect(heavyClass!.members.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts selector from @Component", () => {
    const { classes } = buildProjectClassMap(fixtureDir("clean-project"));
    const appClass = [...classes.values()].find((c) => c.name === "AppComponent");
    expect(appClass).toBeDefined();
    expect(appClass!.selector).toBe("app-root");
  });

  it("returns classes map and inheritanceChains map", () => {
    const result = buildProjectClassMap(fixtureDir("clean-project"));
    expect(result).toHaveProperty("classes");
    expect(result).toHaveProperty("inheritanceChains");
    expect(result.classes).toBeInstanceOf(Map);
    expect(result.inheritanceChains).toBeInstanceOf(Map);
  });
});
