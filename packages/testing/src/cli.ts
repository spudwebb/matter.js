/**
 * @license
 * Copyright 2022-2024 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Must load first to shim crypto on node 18
import "./util/node-shims.js";

import "./global-definitions.js";

import { Builder, Graph, Package, Project } from "#tools";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { TestRunner } from "./runner.js";

enum TestType {
    esm = "esm",
    cjs = "cjs",
    web = "web",
}

Error.stackTraceLimit = 50;

export async function main(argv = process.argv) {
    const testTypes = new Set<TestType>();

    let manual = false;

    const args = await yargs(hideBin(argv))
        .usage("Runs tests in packages adhering to matter.js standards.")
        .option("prefix", {
            alias: "p",
            default: ".",
            type: "string",
            describe: "specify directory of package to test",
        })
        .option("web", {
            alias: "w",
            default: false,
            type: "boolean",
            describe: "enable web tests in default test mode",
        })
        .option("spec", {
            type: "array",
            string: true,
            describe: "One or more paths of tests to run",
            default: "./test/**/*Test.ts",
        })
        .option("all-logs", { type: "boolean", describe: "Emit log messages in real time" })
        .option("debug", { type: "boolean", describe: "Enable Mocha debugging" })
        .option("environment", { alias: "e", type: "string", describe: "Select named test environment" })
        .option("fgrep", { alias: "f", type: "string", describe: "Only run tests matching this string" })
        .option("force-exit", { type: "boolean", describe: "Force Node to exit after tests complete" })
        .option("grep", { alias: "g", type: "string", describe: "Only run tests matching this regexp" })
        .option("invert", { alias: "i", type: "boolean", describe: "Inverts --grep and --fgrep matches" })
        .option("profile", { type: "boolean", describe: "Write profiling data to build/profiles (node only)" })
        .option("wtf", { type: "boolean", describe: "Enlist wtfnode to detect test leaks" })
        .option("trace-unhandled", { type: "boolean", describe: "Detail unhandled rejections with trace-unhandled" })
        .command("*", "run all supported test types")
        .command("esm", "run tests on node (ES6 modules)", () => testTypes.add(TestType.esm))
        .command("cjs", "run tests on node (CommonJS modules)", () => testTypes.add(TestType.cjs))
        .command("web", "run tests in web browser", () => testTypes.add(TestType.web))
        .command("manual", "start test server and print URL for manual testing", () => {
            testTypes.add(TestType.web);
            manual = true;
        })
        .strict().argv;

    // If spec specified and prefix is default, use the spec file to locate the package
    let packageLocation = args.prefix;
    if (packageLocation === "." && args.spec) {
        const firstSpec = Array.isArray(args.spec) ? args.spec[0] : args.spec;
        packageLocation = firstSpec;
    }

    // If the location is a workspace, test all packages with test
    const builder = new Builder();
    const pkg = new Package({ path: packageLocation });
    if (pkg.isWorkspace) {
        const graph = await Graph.load(pkg);
        await graph.build(builder, false);
        for (const node of graph.nodes) {
            if (!node.pkg.hasTests || node.pkg.json.matter?.test === false) {
                continue;
            }

            await test(node.pkg);
        }
    } else {
        const graph = await Graph.forProject(pkg.path);
        if (graph) {
            await graph.build(builder, false);
        } else {
            await builder.build(new Project(pkg));
        }
        await test(pkg);
    }

    async function test(pkg: Package) {
        process.chdir(pkg.path);

        // If no test types are specified explicitly, run all enabled types
        if (!testTypes.size) {
            if (pkg.supportsEsm) {
                testTypes.add(TestType.esm);
            }
            if (pkg.supportsCjs) {
                testTypes.add(TestType.cjs);
            }
            if (args.web) {
                testTypes.add(TestType.web);
            }
        }

        const progress = pkg.start("Testing");
        const runner = new TestRunner(pkg, progress, args);

        if (testTypes.has(TestType.esm)) {
            await runner.runNode("esm");
        }

        if (testTypes.has(TestType.cjs)) {
            await runner.runNode("cjs");
        }

        if (testTypes.has(TestType.web)) {
            await runner.runWeb(manual);
        }

        progress.shutdown();

        if (args.forceExit) {
            process.exit(0);
        }
    }
}
