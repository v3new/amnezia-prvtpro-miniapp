import {QRCodeSVG} from 'qrcode.react'

export function InstructionQrCard({value}: {value: string}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4">
        <QRCodeSVG
          value={value}
          size={360}
          fgColor="#000000"
          bgColor="#ffffff"
          level="M"
          marginSize={2}
          style={{width: '100%', height: 'auto', maxWidth: 360}}
        />
      </div>
    </div>
  )
}
