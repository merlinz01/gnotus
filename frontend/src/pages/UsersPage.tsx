import { Link, useNavigate } from 'react-router-dom'
import useUser from '../stores/user'
import Role from '../types/role'
import { useEffect, useState } from 'react'
import axios, { getErrorMessage } from '../axios'
import type User from '../types/user'
import { roleToString } from '../types/role'
import useConfig from '../stores/config'
import Pagination from '../components/Pagination'
import {
  DEFAULT_PAGE_SIZE,
  type PaginationParams,
  type PaginatedResponse,
  EmptyPaginatedResponse,
} from '../types/pagination'
import TableSkeleton from '../components/TableSkeleton'

export default function UsersPage() {
  const user = useUser((state) => state.user)
  const userLoaded = useUser((state) => state.loaded)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<PaginatedResponse<User>>(EmptyPaginatedResponse)
  const config = useConfig((state) => state.config)
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newRole, setNewRole] = useState(Role.USER)
  const [newIsActive, setNewIsActive] = useState(true)
  const [isNewUser, setIsNewUser] = useState(false)
  const [deleting, setDeleting] = useState<Record<number, boolean>>({})
  const [settingPassword, setSettingPassword] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationParams>({
    page: 1,
    size: DEFAULT_PAGE_SIZE,
  })
  useEffect(() => {
    document.title = `Users - ${config.site_name}`
  }, [config])
  const fetchUsers = async (pagination: PaginationParams) => {
    setLoading(true)
    try {
      const response = await axios.get('/api/users/', {
        params: {
          page: pagination.page,
          size: pagination.size,
        },
      })
      setUsers(response.data)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (!userLoaded) {
      return
    }
    if (!user || user.role !== Role.ADMIN) {
      navigate('/')
      return
    }
    fetchUsers(pagination)
  }, [user, userLoaded, navigate, pagination])

  const saveUserChanges = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingUser) return
    setLoading(true)
    setSaveError(null)
    try {
      if (isNewUser) {
        await axios.post('/api/users/', {
          username: newUsername,
          role: newRole,
          password: (event.currentTarget.elements.namedItem('password')! as HTMLInputElement).value,
          is_active: newIsActive,
        })
      } else {
        await axios.put(`/api/users/${editingUser.id}`, {
          username: newUsername,
          role: newRole,
          is_active: newIsActive,
        })
      }
      fetchUsers(pagination)
      const dialog = document.getElementById('user_edit_dialog') as HTMLDialogElement | null
      if (dialog) dialog.close()
    } catch (error) {
      setSaveError(getErrorMessage(error))
      setLoading(false)
    }
  }
  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingUser) return
    setPasswordError(null)
    try {
      const newPassword = event.currentTarget.elements.namedItem('newPassword')! as HTMLInputElement
      const confirmPassword = event.currentTarget.elements.namedItem(
        'confirmPassword'
      )! as HTMLInputElement
      if (newPassword !== confirmPassword) {
        setSaveError('Passwords do not match.')
        return
      }
      setSettingPassword(true)
      await axios.post(`/api/users/${editingUser.id}/change-password`, {
        old_password: event.currentTarget.oldPassword.value,
        new_password: newPassword,
      })
      const dialog = document.getElementById('change_password_dialog') as HTMLDialogElement | null
      if (dialog) dialog.close()
    } catch (error) {
      console.error('Error changing password:', error)
      setPasswordError(getErrorMessage(error))
    } finally {
      setSettingPassword(false)
    }
  }
  const deleteUser = async (userId: number) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return
    setDeleting({ [userId]: true })
    try {
      await axios.delete(`/api/users/${userId}`)
      fetchUsers(pagination)
    } catch (error) {
      console.error('Error deleting user:', error)
      setDeleting({})
    }
  }
  return (
    <div className="m-4 flex max-h-full flex-col overflow-y-auto">
      <nav className="breadcrumbs text-sm" aria-label="Breadcrumbs">
        <ul>
          <li>
            <Link to="/_admin">Administration</Link>
          </li>
          <li>Users</li>
        </ul>
      </nav>
      <div className="card border-base-300 bg-base-200 border shadow-lg">
        <div className="card-body">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="card-title text-2xl">Users</h2>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setIsNewUser(true)
              setEditingUser({ id: 0, username: '', role: Role.USER, is_active: true })
              setNewUsername('')
              setNewRole(Role.USER)
              setNewIsActive(true)
              const dialog = document.getElementById('user_edit_dialog') as HTMLDialogElement | null
              if (dialog) dialog.showModal()
            }}
          >
            Add User
          </button>
        </div>
        <div className="max-h-200 overflow-x-auto">
          <table className="table w-full table-fixed">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th className="w-50 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton width={4} height={Math.max(pagination.size, 1)} />
              ) : (
                users.items.map((user) => (
                  <tr key={user.id} className={user.is_active ? '' : 'opacity-50'}>
                    <td>{user.username}</td>
                    <td>{roleToString(user.role)}</td>
                    <td>
                      {user.is_active ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge bg-gray-500">Inactive</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-xs btn-secondary"
                        onClick={() => {
                          setIsNewUser(false)
                          setEditingUser(user)
                          setNewUsername(user.username)
                          setNewRole(user.role)
                          setNewIsActive(user.is_active)
                          const dialog = document.getElementById(
                            'user_edit_dialog'
                          ) as HTMLDialogElement | null
                          if (dialog) dialog.showModal()
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-xs btn-accent ml-1"
                        onClick={() => {
                          setEditingUser(user)
                          const dialog = document.getElementById(
                            'change_password_dialog'
                          ) as HTMLDialogElement | null
                          if (dialog) dialog.showModal()
                        }}
                      >
                        Password
                      </button>
                      <button
                        className="btn btn-xs btn-error ml-1"
                        onClick={() => deleteUser(user.id)}
                      >
                        {deleting[user.id] ? (
                          <span className="loading loading-spinner"></span>
                        ) : (
                          'Delete'
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination params={pagination} setParams={setPagination} total={users.total} />
        </div>
      </div>
      <dialog id="user_edit_dialog" className="modal">
        <form className="modal-box" onSubmit={saveUserChanges}>
          <h3 className="mb-2 text-xl font-bold">{isNewUser ? 'Add User' : 'Edit User'}</h3>
          <fieldset className="fieldset">
            <label className="label" htmlFor="user-edit-username">
              Username{' '}
            </label>
            <input
              id="user-edit-username"
              type="text"
              name="username"
              placeholder="Username"
              className="input input-bordered w-full"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              required
            />
            <label className="label" htmlFor="user-edit-role">
              Role
            </label>
            <select
              id="user-edit-role"
              name="role"
              className="select select-bordered w-full"
              value={newRole}
              onChange={(e) => setNewRole(Number.parseInt(e.target.value))}
            >
              {Object.values(Role).map((role) => (
                <option key={role} value={role}>
                  {roleToString(role)}
                </option>
              ))}
            </select>
            <label className="label" htmlFor="user-edit-active">
              <input
                id="user-edit-active"
                type="checkbox"
                name="is_active"
                checked={newIsActive}
                onChange={(e) => setNewIsActive(e.target.checked)}
                className="toggle toggle-primary"
              />
              Active
            </label>
            {isNewUser && (
              <>
                <label className="label" htmlFor="user-edit-password">
                  Password
                </label>
                <input
                  id="user-edit-password"
                  type="password"
                  name="password"
                  placeholder="Password"
                  className="input input-bordered w-full"
                  required
                />
              </>
            )}
          </fieldset>
          {saveError && (
            <div className="alert alert-error mt-4 shadow-lg">
              <span>{saveError}</span>
            </div>
          )}
          <div className="modal-action">
            <button type="submit" className="btn btn-primary">
              Save
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                (document.getElementById('user_edit_dialog') as HTMLDialogElement | null)?.close()
              }
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      <dialog id="change_password_dialog" className="modal">
        <form method="dialog" className="modal-box" onSubmit={changePassword}>
          <h3 className="mb-2 text-xl font-bold">Change Password</h3>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Old Password</legend>
            <input
              type="password"
              name="oldPassword"
              placeholder="Enter old password"
              className="input input-bordered w-full"
              autoComplete="current-password"
              required={user?.role !== Role.ADMIN}
            />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">New Password</legend>
            <input
              type="password"
              name="newPassword"
              placeholder="Enter new password"
              className="input input-bordered w-full"
              autoComplete="new-password"
              required
            />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Confirm Password</legend>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm new password"
              className="input input-bordered w-full"
              autoComplete="new-password"
              required
            />
          </fieldset>
          {saveError && (
            <div className="alert alert-error mt-4 shadow-lg">
              <span>{passwordError}</span>
            </div>
          )}
          <div className="modal-action">
            <button type="submit" className="btn btn-primary">
              {settingPassword ? (
                <span className="loading loading-spinner"></span>
              ) : (
                'Change Password'
              )}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                (
                  document.getElementById('change_password_dialog') as HTMLDialogElement | null
                )?.close()
              }
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      </div>
    </div>
  )
}
