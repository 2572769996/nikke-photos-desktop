import { Fragment } from 'react'

export default function ChangelogItems({ entry }) {
  const sections = entry.sections || [{ start: 1 }]
  return sections.map(({ start, title }, groupIndex) => {
    const nextStart = sections[groupIndex + 1]?.start ?? entry.items.length + 1
    return <Fragment key={start}>
      {title && <h3 className="cl-section">{title}</h3>}
      <ol className="cl-items" start={start}>
        {entry.items.slice(start - 1, nextStart - 1).map((item, index) => (
          <li key={start + index}>{start + index}、{typeof item === 'string'
            ? item.split('**').map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part)
            : <><strong>{item.title}</strong>{item.details?.length > 0 &&
              <ul className="cl-details">{item.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}</>}
          </li>
        ))}
      </ol>
    </Fragment>
  })
}
