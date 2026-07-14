# Product

## Register

product

## Users

Shopee seller-management and BI users who need to inspect a GGP seller and turn listing-performance data into practical assortment actions during daily work. The same internal audience also needs a concise operational view of the application server and deployed service health.

## Product Purpose

Listing Workstation accepts a complete GGP Name, queries DataSuite directly, and presents zone-level strategy summaries plus the most relevant listings. Success means a user can intentionally run one seller query, understand its progress, and act on a trustworthy result without depending on a Google Sheet queue.

Server Surveillance provides a separate, read-only view of server load, memory, uptime, response latency, and critical application health. Success means an operator can recognize normal, warning, or critical conditions without receiving sensitive process, credential, or infrastructure data.

## Brand Personality

Operational, trustworthy, actionable. The interface should feel like an internal decision tool, not a marketing site.

## Anti-references

Avoid consumer-shopping decoration, ambiguous automatic actions, hidden background refreshes, excessive dashboard cards, and interfaces that make users guess whether a long-running query was submitted.

## Design Principles

1. Make every expensive data request explicit and user-initiated.
2. Keep query status, success evidence, and errors visible near the initiating control.
3. Preserve familiar internal-tool interaction patterns and terminology.
4. Prefer concise operational evidence such as row, zone, and SKU counts over decorative feedback.
5. Keep credentials and infrastructure details outside the browser-facing interface.
6. Use explicit thresholds, timestamps, and service checks so operational status can be independently verified.

## Accessibility & Inclusion

Target WCAG 2.1 AA for contrast, keyboard operation, focus visibility, semantic controls, disabled states, and status messages that remain understandable without relying on color alone.
