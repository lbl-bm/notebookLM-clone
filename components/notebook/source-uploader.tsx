/**
 * 添加来源模态框组件
 * US-003 & US-004: 完整的添加来源体验
 * 包含搜索框 + 文件上传区域 + URL添加
 */

'use client'

import { useState, useRef } from 'react'
import { Attachments } from '@ant-design/x'
import type { GetProp, UploadProps } from 'antd'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Upload,
  Link2,
  FileText,
  Loader2,
  X,
  CheckCircle2,
  Youtube,
  Globe,
  AlertCircle,
  Type,
} from 'lucide-react'
import { SourceSearchBox } from './add-source-dialog'

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0]

interface AttachmentsRef {
  nativeElement: HTMLDivElement | null
  fileNativeElement: HTMLInputElement | null
  upload: (file: File) => void
  select: (options: { accept?: string; multiple?: boolean }) => void
}

interface UploadingFile {
  uid: string
  name: string
  status: 'uploading' | 'done' | 'error'
  percent?: number
  error?: string
}

interface AddSourceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notebookId: string
  currentSourceCount?: number
  maxSourceCount?: number
  onSuccess?: () => void
}

export function AddSourceModal({
  open,
  onOpenChange,
  notebookId,
  currentSourceCount = 0,
  maxSourceCount = 50,
  onSuccess,
}: AddSourceModalProps) {
  const attachmentsRef = useRef<AttachmentsRef>(null)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  
  // URL 输入状态
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')

  // 文字输入状态
  const [showTextInput, setShowTextInput] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState('')
  const [textCharCount, setTextCharCount] = useState(0)

  const handleUpload = (file: FileType) => {
    const uid = file.uid || crypto.randomUUID()
    
    setUploadingFiles(prev => [...prev, {
      uid,
      name: file.name,
      status: 'uploading',
      percent: 0,
    }])

    // 异步执行上传
    const doUpload = async () => {
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('notebookId', notebookId)

        const response = await fetch('/api/sources/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || '上传失败')
        }

        setUploadingFiles(prev => prev.map(f => 
          f.uid === uid ? { ...f, status: 'done', percent: 100 } : f
        ))

        // 上传成功后自动触发处理队列
        fetch('/api/cron/process-queue?manual=true').catch(err => {
          console.error('触发处理队列失败:', err)
        })

        setTimeout(() => {
          setUploadingFiles(prev => prev.filter(f => f.uid !== uid))
          onSuccess?.()
        }, 1000)

      } catch (error) {
        setUploadingFiles(prev => prev.map(f => 
          f.uid === uid ? { ...f, status: 'error', error: (error as Error).message } : f
        ))
      }
    }

    doUpload()
    
    // 返回 false 阻止 Attachments 组件的默认上传行为
    return false
  }

  const handleRemoveFile = (uid: string) => {
    setUploadingFiles(prev => prev.filter(f => f.uid !== uid))
  }

  const handleSelectFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    attachmentsRef.current?.select({
      accept: '.pdf',
      multiple: true,
    })
  }

  const handleSearchSuccess = () => {
    onSuccess?.()
  }

  // 处理添加 URL
  const handleAddUrl = async () => {
    const url = urlValue.trim()
    if (!url) return

    // 验证 URL 格式
    try {
      const urlObj = new URL(url)
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        setUrlError('仅支持 http/https 链接')
        return
      }
    } catch {
      setUrlError('请输入有效的网址')
      return
    }

    setUrlError('')
    setUrlLoading(true)

    try {
      const response = await fetch('/api/sources/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId,
          url,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '添加失败')
      }

      // 成功后清空并关闭输入框
      setUrlValue('')
      setShowUrlInput(false)
      
      // 添加成功后自动触发处理队列
      fetch('/api/cron/process-queue?manual=true').catch(err => {
        console.error('触发处理队列失败:', err)
      })
      
      // 如果有警告，显示一下
      if (data.warning) {
        setUrlError(data.warning)
        setTimeout(() => setUrlError(''), 3000)
      }

      onSuccess?.()
    } catch (err) {
      setUrlError((err as Error).message)
    } finally {
      setUrlLoading(false)
    }
  }

  const handleWebsiteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setShowUrlInput(true)
    setShowTextInput(false)
    setUrlError('')
  }

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setShowTextInput(true)
    setShowUrlInput(false)
    setTextError('')
  }

  // 处理添加文字
  const handleAddText = async () => {
    const title = textTitle.trim()
    const content = textContent.trim()

    if (!title) {
      setTextError('请输入标题')
      return
    }

    if (content.length < 10) {
      setTextError('文字内容至少需要 10 个字符')
      return
    }

    if (content.length > 50000) {
      setTextError('文字内容不能超过 50000 字符')
      return
    }

    setTextError('')
    setTextLoading(true)

    try {
      const response = await fetch('/api/sources/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId,
          title,
          content,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '添加失败')
      }

      // 成功后清空并关闭输入框
      setTextTitle('')
      setTextContent('')
      setTextCharCount(0)
      setShowTextInput(false)

      // 添加成功后自动触发处理队列
      fetch('/api/cron/process-queue?manual=true').catch(err => {
        console.error('触发处理队列失败:', err)
      })

      onSuccess?.()
    } catch (err) {
      setTextError((err as Error).message)
    } finally {
      setTextLoading(false)
    }
  }

  const progress = Math.round((currentSourceCount / maxSourceCount) * 100)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-white dark:bg-slate-900 p-0 gap-0">
        {/* 标题区域 */}
        <div className="text-center pt-6 pb-4 px-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            根据以下内容生成多模态概览展示
          </h2>
        </div>
        
        <div className="space-y-5 px-6 pb-6">
          {/* 搜索框组件 - 居中显示，限制最大宽度 */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <SourceSearchBox
                notebookId={notebookId}
                onSuccess={handleSearchSuccess}
              />
            </div>
          </div>

          {/* 上传区域 - 居中显示，限制最大宽度 */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <Attachments
                ref={attachmentsRef}
                beforeUpload={handleUpload}
                accept=".pdf"
                multiple
                getDropContainer={() => document.getElementById('modal-upload-drop-zone')}
              >
                <div
                  id="modal-upload-drop-zone"
                  className={`
                    border-2 border-dashed rounded-xl p-8 text-center transition-all
                    ${isDragging 
                      ? 'border-slate-400 bg-slate-100 dark:bg-slate-800' 
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }
                  `}
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={() => setIsDragging(false)}
                >
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    或将文件拖至此处
                  </p>
                  
                  {/* 来源类型按钮 */}
                  <div className="flex items-center justify-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 gap-2 rounded-full border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      onClick={handleSelectFile}
                    >
                      <Upload className="h-4 w-4" />
                      上传文件
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 gap-2 rounded-full border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      onClick={handleWebsiteClick}
                    >
                      <div className="flex items-center gap-1">
                        <Globe className="h-4 w-4" />
                      </div>
                      网站
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 gap-2 rounded-full border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      onClick={handleTextClick}
                    >
                      <Type className="h-4 w-4" />
                      复制的文字
                    </Button>
                  </div>
                </div>
              </Attachments>
            </div>
          </div>

          {/* URL 输入区域 */}
          {showUrlInput && (
            <div className="flex justify-center">
              <div className="w-full max-w-md space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="输入网页链接（http:// 或 https://）"
                    value={urlValue}
                    onChange={(e) => {
                      setUrlValue(e.target.value)
                      setUrlError('')
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                    className="flex-1 h-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={handleAddUrl}
                    disabled={!urlValue.trim() || urlLoading}
                    className="h-10 px-4"
                  >
                    {urlLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      '添加'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => {
                      setShowUrlInput(false)
                      setUrlValue('')
                      setUrlError('')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {urlError && (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">{urlError}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 文字输入区域 */}
          {showTextInput && (
            <div className="flex justify-center">
              <div className="w-full max-w-md space-y-3">
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="为这段文字起个标题"
                    value={textTitle}
                    onChange={(e) => {
                      setTextTitle(e.target.value)
                      setTextError('')
                    }}
                    className="flex-1 h-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    autoFocus
                  />
                </div>
                <div className="relative">
                  <textarea
                    placeholder="粘贴你复制的文字内容..."
                    value={textContent}
                    onChange={(e) => {
                      setTextContent(e.target.value)
                      setTextCharCount(e.target.value.length)
                      setTextError('')
                    }}
                    className="w-full h-40 p-3 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute bottom-2 right-2 text-xs text-slate-400">
                    {textCharCount}/50000
                  </span>
                </div>
                {textError && (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">{textError}</p>
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowTextInput(false)
                      setTextTitle('')
                      setTextContent('')
                      setTextCharCount(0)
                      setTextError('')
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddText}
                    disabled={!textContent.trim() || textLoading || textCharCount < 10}
                    className="h-9 px-4"
                  >
                    {textLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        添加中...
                      </>
                    ) : (
                      '添加'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 上传进度列表 */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-2">
              {uploadingFiles.map((file) => (
                <div
                  key={file.uid}
                  className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <div className="w-8 h-8 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">{file.name}</p>
                    {file.status === 'uploading' && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-slate-500 transition-all duration-300"
                            style={{ width: `${file.percent || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">
                          {file.percent || 0}%
                        </span>
                      </div>
                    )}
                    {file.status === 'done' && (
                      <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3 h-3" />
                        上传成功
                      </p>
                    )}
                    {file.status === 'error' && (
                      <p className="text-xs text-red-500 mt-1">
                        {file.error || '上传失败'}
                      </p>
                    )}
                  </div>
                  {file.status === 'uploading' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-slate-200 dark:hover:bg-slate-700"
                      onClick={() => handleRemoveFile(file.uid)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 底部进度条 */}
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-slate-500 whitespace-nowrap">
              {currentSourceCount}/{maxSourceCount}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
