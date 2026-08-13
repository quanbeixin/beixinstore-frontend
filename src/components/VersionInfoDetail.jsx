import {
  CheckOutlined,
  CopyOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { Button, Empty, Tag, Tooltip, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import './VersionInfoDetail.css'

const { Paragraph, Text, Title } = Typography

function stripJsonComments(value) {
  const source = String(value || '')
  let result = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === '/' && next === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') index += 1
      result += '\n'
      continue
    }

    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') result += '\n'
        index += 1
      }
      index += 1
      continue
    }

    result += char
  }

  return result.replace(/,\s*([}\]])/g, '$1')
}

function parseVersionInfo(value) {
  const raw = String(value || '').trim()
  if (!raw) return { parsed: null, raw: '' }
  try {
    const parsed = JSON.parse(stripJsonComments(raw))
    return {
      parsed: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null,
      raw,
    }
  } catch {
    return { parsed: null, raw }
  }
}

function normalizeValue(value) {
  if (value === null || value === undefined || String(value).trim() === '') return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function CopyValueButton({ value }) {
  const [copied, setCopied] = useState(false)
  const text = normalizeValue(value)

  if (!text) return null

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const input = document.createElement('textarea')
        input.value = text
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        input.remove()
      }
      setCopied(true)
      message.success('已复制')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  return (
    <Tooltip title={copied ? '已复制' : '复制内容'}>
      <Button
        type="text"
        size="small"
        className="version-info-copy-button"
        icon={copied ? <CheckOutlined /> : <CopyOutlined />}
        onClick={handleCopy}
        aria-label="复制内容"
      />
    </Tooltip>
  )
}

function ConfigValue({ value, isUrl = false }) {
  const text = normalizeValue(value)
  if (!text) return <Text type="secondary">未配置</Text>

  return (
    <div className="version-info-value">
      {isUrl ? (
        <a href={text} target="_blank" rel="noreferrer" className="version-info-value-link">
          <LinkOutlined />
          <span>{text}</span>
        </a>
      ) : (
        <Paragraph className="version-info-value-text" ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}>
          {text}
        </Paragraph>
      )}
      <CopyValueButton value={text} />
    </div>
  )
}

function ConfigSection({ icon, title, fields }) {
  const visibleFields = fields.filter((field) => field.visible)
  if (visibleFields.length === 0) return null

  return (
    <section className="version-info-section">
      <div className="version-info-section-heading">
        <span className="version-info-section-icon">{icon}</span>
        <Text strong>{title}</Text>
      </div>
      <div className="version-info-field-grid">
        {visibleFields.map((field) => (
          <div className="version-info-field" key={field.key}>
            <Text className="version-info-field-label">{field.label}</Text>
            <ConfigValue value={field.value} isUrl={field.isUrl} />
          </div>
        ))}
      </div>
    </section>
  )
}

function getSnapshot(configuration) {
  return {
    appName: normalizeValue(configuration?.app_name),
    analyticsUrl: normalizeValue(configuration?.endpoints?.analytics_url),
    baseUrl: normalizeValue(configuration?.endpoints?.base_url),
    facebookAppId: normalizeValue(configuration?.facebook?.app_id),
    facebookClientToken: normalizeValue(configuration?.facebook?.client_token),
    firebaseProjectId: normalizeValue(configuration?.google?.firebase_project_id),
    googleWebClientId: normalizeValue(configuration?.google?.web_client_id),
    getuiAppId: normalizeValue(configuration?.push?.getui?.app_id),
    oppoAppKey: normalizeValue(configuration?.push?.oppo?.app_key),
    oppoAppSecret: normalizeValue(configuration?.push?.oppo?.app_secret),
    snapchat: Array.isArray(configuration?.snapchat) ? configuration.snapchat : [],
    tiktokAppId: normalizeValue(configuration?.tiktok?.app_id),
    tiktokClientToken: normalizeValue(configuration?.tiktok?.client_token),
  }
}

export default function VersionInfoDetail({ record }) {
  const { parsed, raw } = useMemo(() => parseVersionInfo(record?.version_info), [record?.version_info])
  const snapshot = useMemo(() => getSnapshot(parsed?.configuration || {}), [parsed])
  const features = Array.isArray(parsed?.features) ? parsed.features.filter(Boolean) : []

  if (!parsed) {
    return (
      <div className="version-info-fallback">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="版本信息不是可解析的 JSON 配置" />
        <Paragraph className="version-info-raw-text">{raw || '暂无版本信息'}</Paragraph>
        <CopyValueButton value={raw} />
      </div>
    )
  }

  const snapchatFields = snapshot.snapchat.flatMap((item, index) => [
    { key: `snapchat-${index}-app-id`, label: `App ID${snapshot.snapchat.length > 1 ? ` ${index + 1}` : ''}`, value: item?.app_id, visible: true },
    { key: `snapchat-${index}-client-token`, label: `Client Token${snapshot.snapchat.length > 1 ? ` ${index + 1}` : ''}`, value: item?.client_token, visible: true },
  ])

  return (
    <div className="version-info-detail">
      <div className="version-info-hero">
        <div>
          <Text className="version-info-eyebrow">前端构建版本</Text>
          <Title level={4} className="version-info-title">{snapshot.appName || '未命名应用'}</Title>
          {record?.updated_at ? <Text className="version-info-updated-at">更新于 {record.updated_at}</Text> : null}
        </div>
        <Tag color="blue" className="version-info-version-tag">{record?.version_number || '未填写版本号'}</Tag>
      </div>

      {features.length > 0 ? (
        <section className="version-info-feature-section">
          <div className="version-info-section-heading">
            <span className="version-info-section-icon"><InfoCircleOutlined /></span>
            <Text strong>需求覆盖</Text>
          </div>
          <ul className="version-info-feature-list">
            {features.map((feature, index) => <li key={`${feature}-${index}`}>{feature}</li>)}
          </ul>
        </section>
      ) : null}

      <div className="version-info-sections">
        <ConfigSection
          icon={<GlobalOutlined />}
          title="环境地址"
          fields={[
            { key: 'analytics', label: '原生埋点地址', value: snapshot.analyticsUrl, visible: true, isUrl: true },
            { key: 'base', label: 'H5 地址', value: snapshot.baseUrl, visible: true, isUrl: true },
          ]}
        />
        <ConfigSection
          icon={<span className="version-info-section-letter">f</span>}
          title="Facebook"
          fields={[
            { key: 'app-id', label: 'Facebook App ID', value: snapshot.facebookAppId, visible: true },
            { key: 'client-token', label: 'Facebook Client Token', value: snapshot.facebookClientToken, visible: true },
          ]}
        />
        <ConfigSection
          icon={<span className="version-info-section-letter">G</span>}
          title="Google"
          fields={[
            { key: 'project-id', label: 'Firebase Project ID', value: snapshot.firebaseProjectId, visible: true },
            { key: 'web-client-id', label: 'Google 登录 Client ID', value: snapshot.googleWebClientId, visible: true },
          ]}
        />
        <ConfigSection
          icon={<span className="version-info-section-letter">P</span>}
          title="PUSH"
          fields={[
            { key: 'getui-app-id', label: '个推 App ID', value: snapshot.getuiAppId, visible: true },
            { key: 'oppo-app-key', label: 'OPPO App Key', value: snapshot.oppoAppKey, visible: true },
            { key: 'oppo-app-secret', label: 'OPPO App Secret', value: snapshot.oppoAppSecret, visible: true },
          ]}
        />
        <ConfigSection icon={<span className="version-info-section-letter">S</span>} title="Snapchat" fields={snapchatFields} />
        <ConfigSection
          icon={<span className="version-info-section-letter">T</span>}
          title="TikTok"
          fields={[
            { key: 'app-id', label: 'TikTok App ID', value: snapshot.tiktokAppId, visible: true },
            { key: 'client-token', label: 'TikTok Client Token', value: snapshot.tiktokClientToken, visible: true },
          ]}
        />
      </div>
    </div>
  )
}
