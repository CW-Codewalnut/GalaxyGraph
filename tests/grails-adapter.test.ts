import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateGrailsDataset } from "../packages/adapters/src/grails";

describe("Grails adapter", () => {
  it("discovers sibling Spock unit specs when root is server/grails-app", async () => {
    const root = join(tmpdir(), `galaxy-graph-grails-${Date.now()}`);
    const grailsApp = join(root, "server", "grails-app");
    const controllerDir = join(grailsApp, "controllers", "com", "cnl", "apps", "common");
    const testDir = join(root, "server", "src", "test", "groovy", "com", "cnl", "apps", "harness", "unit");

    await mkdir(controllerDir, { recursive: true });
    await mkdir(testDir, { recursive: true });

    try {
      await writeFile(
        join(controllerDir, "CustomerController.groovy"),
        `package com.cnl.apps.common

class CustomerController {
  static allowedMethods = [save: "POST"]

  def save() {
    render "ok"
  }
}
`,
        "utf8"
      );
      await writeFile(
        join(testDir, "CustomerControllerSpec.groovy"),
        `package com.cnl.apps.harness.unit

import com.cnl.apps.common.CustomerController
import grails.testing.web.controllers.ControllerUnitTest
import spock.lang.Specification

class CustomerControllerSpec extends Specification implements ControllerUnitTest<CustomerController> {
  void "save persists customer"() {
    expect:
    true
  }

  void "save rejects invalid customer"() {
    expect:
    true
  }
}
`,
        "utf8"
      );

      const dataset = await generateGrailsDataset(grailsApp);

      expect(dataset.services.map((s) => s.svc)).toContain("customer");
      expect(dataset.endpoints.map((e) => `${e.svc}:${e.fnName}`)).toContain("customer:save");
      expect(dataset.tests).toHaveLength(2);
      expect(dataset.tests.map((t) => t.name)).toEqual([
        "save persists customer",
        "save rejects invalid customer",
      ]);
      expect(dataset.tests[0]).toMatchObject({
        svc: "customer",
        endpoints: ["customer:save"],
        category: "unit",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses generic Grails mappings, client calls, and injected service dependencies", async () => {
    const root = join(tmpdir(), `galaxy-graph-grails-generic-${Date.now()}`);
    const grailsApp = join(root, "server", "grails-app");
    const controllerDir = join(grailsApp, "controllers", "org", "acme", "modules", "billing");
    const mappingsDir = join(grailsApp, "controllers", "org", "acme");
    const serviceDir = join(grailsApp, "services", "org", "acme", "modules", "billing");
    const webDir = join(root, "web", "src");

    await mkdir(controllerDir, { recursive: true });
    await mkdir(mappingsDir, { recursive: true });
    await mkdir(serviceDir, { recursive: true });
    await mkdir(webDir, { recursive: true });

    try {
      await writeFile(
        join(controllerDir, "InvoiceController.groovy"),
        `package org.acme.modules.billing

class InvoiceController {
  def invoiceService

  def submit() {
    invoiceService.createInvoice()
    render "ok"
  }
}
`,
        "utf8"
      );
      await writeFile(
        join(serviceDir, "InvoiceService.groovy"),
        `package org.acme.modules.billing

class InvoiceService {
  def createInvoice() {
    true
  }
}
`,
        "utf8"
      );
      await writeFile(
        join(mappingsDir, "UrlMappings.groovy"),
        `package org.acme

class UrlMappings {
  static mappings = {
    "/api/invoices/$id"(controller: "invoice", action: "submit", method: "put")
  }
}
`,
        "utf8"
      );
      await writeFile(
        join(webDir, "api.ts"),
        `import axios from "axios";

export async function submitInvoice() {
  await fetch("/api/invoice/submit", { method: "POST" });
  await axios.get("/api/login");
  await fetch("https://translation.googleapis.com/language/translate/v2");
}
`,
        "utf8"
      );

      const dataset = await generateGrailsDataset(root);

      expect(dataset.services.map((s) => s.svc)).toEqual(expect.arrayContaining([
        "invoice",
        "invoice-service",
        "web-client",
        "oauth-provider",
        "google-translate",
      ]));
      expect(dataset.endpoints.find((ep) => ep.id === "ep:invoice:submit")).toMatchObject({
        method: "PUT",
        path: "/api/invoices/:id",
      });
      expect(dataset.endpoints.find((ep) => ep.id === "ep:invoice-service:createInvoice")).toMatchObject({
        internal: true,
        method: "INTERNAL",
      });
      expect(dataset.contracts.map((contract) => contract.id)).toEqual(expect.arrayContaining([
        "contract:invoice:invoice-service",
        "contract:web-client:invoice:api-consumer",
        "contract:web-client:oauth-provider",
        "contract:web-client:google-translate",
      ]));
      expect(dataset.colors?.["web-client"]).toBe("#38bdf8");
      expect(dataset.colors?.["oauth-provider"]).toBe("#f59e0b");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
