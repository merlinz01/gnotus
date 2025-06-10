const Role = {
  USER: 1,
  ADMIN: 2,
  VIEWER: 3,
}

export function roleToString(role: number): string {
  switch (role) {
    case Role.USER:
      return 'User'
    case Role.ADMIN:
      return 'Admin'
    case Role.VIEWER:
      return 'Viewer'
    default:
      return 'Unknown'
  }
}

export default Role
