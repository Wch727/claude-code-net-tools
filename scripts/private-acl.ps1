param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference = 'Stop'
$item = Get-Item -LiteralPath $Target -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing reparse point' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
if ($item.PSIsContainer) {
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $inherit = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
} else {
  $acl = New-Object Security.AccessControl.FileSecurity
  $inherit = [Security.AccessControl.InheritanceFlags]::None
}
$acl.SetOwner($identity)
$acl.SetAccessRuleProtection($true, $false)
foreach ($sid in @($identity, $system)) {
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', $inherit, 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
if ($PSVersionTable.PSVersion.Major -ge 6) {
  [IO.FileSystemAclExtensions]::SetAccessControl($item, $acl)
} else {
  $item.SetAccessControl($acl)
}
