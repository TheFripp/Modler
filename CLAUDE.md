# Modler V2 - Development Guide

## IMPORTANT: Keep This Document Minimal
- This file must remain under 100 lines
- Use brief, single-line descriptions only
- All details belong in `/documentation/`
- Do not add examples, code snippets, or detailed explanations

## Project Overview
CAD software with rule-based parametric design and intelligent 3D auto-layout system. Container-based hierarchies with automatic object distribution, gap management, and constraint-based positioning.

**Architecture**: 3-layer selection flow with container-first logic, render-order wireframes, and GeometryUtils-driven support mesh updates.

## Agents (Use Only When Explicitly Requested)
- **Architecture Guardian**: Prevent complexity creep, review architectural decisions
- **Implementation Specialist**: Build approved features following established patterns
- **Documentation Keeper**: Update documentation when patterns change
- **System Health Monitor**: End-to-end validation after implementation complete
- **Code Cleaner**: Remove debug code after user confirms feature works
- **Git Agent**: Repository operations when user approves commits

## Core Architecture Principles
- **Simplicity**: Direct solutions over abstractions, 3-layer flow: `Click → Tool → SelectionController`
- **Container-First Selection**: Click child → selects parent container, double-click for direct selection
- **CAD Geometry**: ALWAYS use geometry-based manipulation, NEVER visual transforms
- **Support Mesh Architecture**: Create once as children at object creation, then only show/hide - master object is single source of truth
- **UI ↔ 3D Communication**: Simplified 3-type system (selection, hierarchy, tool-state), consistent `parentContainer` field naming
- **Container Creation**: Direct command (Cmd+F) → ToolController → ContainerManager
- **Layout Mode**: Property-panel driven, NOT tool-driven
- **Mesh Synchronization**: Support meshes are self-contained children, inherit transforms automatically

## Development Standards
- **Implementation**: Direct solutions, no over-engineering, support mesh principle
- **Logging**: NEVER log on animation loops, remove ALL debug logging before completion
- **Browser**: Do NOT open new windows, respect user's session
- **Documentation**: Minimal, practical focus, reference `/documentation/` for details
- **File Limits**: Tools 200 lines, Controllers 300 lines
- **Container Architecture**: Never assume tool dependency for container operations

## Documentation
Versioned documentation system with semantic versioning and currency tracking.
See [`/documentation/README.md`](documentation/README.md) for all documentation.

## File Structure Reference
- **Scene**: `/scene/scene-controller.js` - Main object management
- **Tools**: `/application/tools/` - All interactive tools
- **Selection**: `/interaction/` - Selection and visualization systems
- **UI**: `/svelte-ui/` - Svelte components and panels
- **Support**: `/interaction/support-mesh-factory.js` - Visualization mesh creation
- **Geometry**: `/interaction/geometry-utils.js` - CAD geometry operations and support mesh synchronization

---

**⚠️ CRITICAL**: Keep this file concise. Detailed patterns belong in focused documentation files.