export default function TableSkeleton({ width, height }: { width: number; height: number }) {
  return Array.from({ length: height }).map((_, index) => (
    <tr key={index}>
      <td colSpan={width}>
        <div className="skeleton h-6 w-full"></div>
      </td>
    </tr>
  ))
}
