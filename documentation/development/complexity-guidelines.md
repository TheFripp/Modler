# Modler V2 - Updated Complexity Guidelines

## Philosophy
These guidelines prioritize **good architecture** and **maintainability** over arbitrary line limits.

## File Size Guidelines

### JavaScript Files
- **Preferred**: 150-300 lines per file
- **Acceptable**: Up to 500 lines if it serves clear architectural purpose
- **Split when**: Logic becomes complex enough to benefit from separation

### CSS Files  
- **Preferred**: Single well-organized stylesheet for cohesive theming
- **Acceptable**: 400-600 lines for complete UI system
- **Split when**: Different concerns (themes, print styles, vendor-specific)

### HTML Files
- **Preferred**: Minimal, focused on structure
- **Acceptable**: Inline scripts for initialization if it improves clarity

## Decision Framework

**Keep files together when:**
- Functions are tightly coupled
- Splitting would require complex inter-file communication
- The file represents a cohesive system (like complete CSS theme)
- Splitting would hurt debugging and maintenance

**Split files when:**
- Clear separation of concerns exists
- Individual components can be independently tested
- Different developers might work on different parts
- File becomes genuinely difficult to navigate

## Architecture Principles

1. **Clarity over brevity** - Better to have a clear 400-line file than confusing 200-line splits
2. **Cohesion over arbitrary limits** - Related functionality should stay together
3. **Maintainability first** - Optimize for the developer who needs to maintain the code
4. **Informed decisions** - Use judgment based on the specific context

## Examples

- ✅ `modler-v2.css` (400 lines) - Complete theme system, easier to maintain colors/spacing
- ✅ `scene-controller.js` (350 lines) - Cohesive 3D scene management
- ❌ Splitting CSS into base/panels/forms just to meet 300-line limit
- ❌ Breaking apart tightly coupled class methods across files

## Updated from Previous Guidelines

**Previous**: Strict 300-line limit caused architectural problems
**Current**: Flexible limits based on architectural merit
**Result**: Better maintainability and clearer code organization