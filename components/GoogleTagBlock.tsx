// GoogleTag Puck block - editor-safe half. The real work happens in
// GoogleTagBlock.rsc.tsx, which reads the module's settings and the site's
// cookie banner and so cannot be imported from the editor bundle.
//
// The block carries no props of its own: which accounts to send to, and whether
// to wait for consent, are site-wide decisions that belong in module settings,
// not in a layout. This is a placement marker - it says "put the tag on every
// page that uses this layout" and nothing more.

function EditorPreview() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 0.9rem', borderRadius: '0.5rem', margin: '0.5rem',
      background: 'var(--color-surface-subtle, #f4f1ea)',
      border: '1px dashed var(--color-border, #e5e0d8)',
      color: 'var(--color-text-secondary, #6b6355)',
      fontSize: '0.8125rem', fontWeight: 600,
    }}>
      📈 Google tag (invisible on the real site)
    </div>
  )
}

export const googleTagBlockComponent = {
  label: 'Google Tag',
  fields: {},
  defaultProps: {},
  render: EditorPreview,
}
