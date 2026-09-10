---
name: Family Finance
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434655'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#ab0b1c'
  on-tertiary: '#ffffff'
  tertiary-container: '#cf2c30'
  on-tertiary-container: '#ffecea'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies a modern, clean, and approachable personality designed specifically for family financial tracking. It bridges the gap between institutional reliability and household warmth, evoking a sense of security, clarity, and collaborative empowerment. 

We draw from a **Minimalism** and **Corporate / Modern** fusion style. The visual language relies on generous whitespace, an intentional and restricted color palette, high-fidelity typography, and subtle ambient shadows to delineate surfaces without clutter.

## Colors

The color palette is built on a foundation of trust, clarity, and status-driven feedback. 

- **Primary Blue (`#2563EB`):** Conveys stability, security, and institutional trust. Used for primary actions, active navigation states, and core brand touchpoints.
- **Secondary Green (`#10B981`):** Represents growth, positive cash flow, income, and settled balances.
- **Tertiary Red (`#EF4444`):** Acts as a clear indicator for expenses, alert states, and budget overruns.
- **Neutral Background (`#F8FAFC`):** Provides a clean, calm canvas that reduces cognitive load during data-heavy financial reviews.

## Typography

Using the **Inter** typeface family throughout, this design system establishes a neutral, highly readable, and utilitarian typographic hierarchy. 

To maintain readability across form factors, large scale headlines adapt intelligently: desktop experiences leverage expansive layouts with high-impact type scales, while mobile viewports seamlessly downscale primary headers to prevent wrapping issues and preserve vertical screen real estate.

## Layout & Spacing

The application employs a **fluid grid** model paired with a mobile-first philosophy. On mobile devices, content spans a single-column layout with 16px outer margins, prioritizing thumb-zone accessibility. As the viewport expands to tablet and desktop, a smooth transition introduces a persistent collapsible sidebar navigation and multi-column CSS grid structures (up to 12 columns) with 24px gutters.

Spacing follows an 8px base rhythm (`space-sm` = 8px, `space-md` = 16px, `space-lg` = 24px, `space-xl` = 40px) ensuring consistent vertical rhythm and component breathing room.

## Elevation & Depth

Visual hierarchy is established primarily through **ambient shadows** and clean tonal layering. 

Surfaces are elevated using soft, diffused shadows tinted with primary blue undertones rather than harsh blacks (`0px 4px 20px -2px rgba(37, 99, 235, 0.08)`). Interactive elements and floating action buttons feature higher elevation tiers (`0px 8px 30px -4px rgba(37, 99, 235, 0.12)`), while background layers remain completely flat to maximize clarity.

## Shapes

The shape language uses a **rounded** approach (Level 2) to maintain a warm, approachable family-oriented feel. 

Base containers, cards, and input fields feature a `0.5rem` (8px) corner radius, while prominent action buttons, badges, and avatars leverage `rounded-lg` (`1rem`) or pill shapes. This curates a friendly interface that avoids rigid, corporate sharpness without sacrificing structural precision.

## Components

### Buttons
Primary buttons utilize the solid Primary Blue (`#2563EB`) with a subtle hover state shift and smooth active scale transformation. Secondary actions use ghost or soft-tinted variants. Destructive actions trigger Tertiary Red (`#EF4444`).

### Chips & Badges
Pill-shaped containers used for categorization and status tagging. Income tags use soft green backgrounds with text in `#10B981`; expense and budget alerts use soft red backgrounds with text in `#EF4444`.

### Input Fields
Clean text inputs featuring a light neutral background, 1px subtle border, and 8px border-radius. On focus, the border transitions smoothly to Primary Blue with a matching soft-glow ring.

### Cards
White cards (`#FFFFFF`) featuring soft ambient shadows and rounded corners. Used as the foundational container for account balances, transaction feeds, and monthly budget summaries.

### Checkboxes & Radio Buttons
Minimalist geometric indicators with a 2px stroke width, utilizing Primary Blue for selected states to maintain clear affordance.

### Recommended Add-on Components
- **Progress Ring / Budget Meter:** Visual circular or linear gauges indicating spent vs. allocated family budgets using dynamic green-to-red color interpolation.
- **Transaction Item Row:** Compact list items featuring merchant icons, category chips, and clear numerical value coloring (green for incoming, dark neutral for outgoing).
- **Bottom Navigation Bar:** Mobile-first persistent navigation bar with tactile iconography for rapid switching between Dashboard, Transactions, Budgets, and Settings.