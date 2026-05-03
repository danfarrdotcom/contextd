import meta from "../../../pages/_meta.js";
import cli_meta from "../../../pages/cli/_meta.js";
export const pageMap = [{
  data: meta
}, {
  name: "cli",
  route: "/cli",
  children: [{
    data: cli_meta
  }, {
    name: "check",
    route: "/cli/check",
    frontMatter: {
      "sidebarTitle": "Check"
    }
  }, {
    name: "decision",
    route: "/cli/decision",
    frontMatter: {
      "sidebarTitle": "Decision"
    }
  }, {
    name: "export",
    route: "/cli/export",
    frontMatter: {
      "sidebarTitle": "Export"
    }
  }, {
    name: "serve",
    route: "/cli/serve",
    frontMatter: {
      "sidebarTitle": "Serve"
    }
  }]
}, {
  name: "context-files",
  route: "/context-files",
  frontMatter: {
    "sidebarTitle": "Context Files"
  }
}, {
  name: "export-formats",
  route: "/export-formats",
  frontMatter: {
    "sidebarTitle": "Export Formats"
  }
}, {
  name: "getting-started",
  route: "/getting-started",
  frontMatter: {
    "sidebarTitle": "Getting Started"
  }
}, {
  name: "index",
  route: "/",
  frontMatter: {
    "sidebarTitle": "Index"
  }
}, {
  name: "mcp-server",
  route: "/mcp-server",
  frontMatter: {
    "sidebarTitle": "Mcp Server"
  }
}, {
  name: "vscode-extension",
  route: "/vscode-extension",
  frontMatter: {
    "sidebarTitle": "Vscode Extension"
  }
}];