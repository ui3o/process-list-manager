autoload -Uz add-zsh-hook # load add-zsh-hook with zsh (-z) and suppress aliases (-U)
add-zsh-hook precmd _precmd # hook custom_func into the precmd hook

POL_CURRENT_LIST=$ZSH_CACHE_DIR/completions/pol.folders.list.curent.out
POL_LAST_LIST=$ZSH_CACHE_DIR/completions/pol.folders.list.last.out
ETC_PATH=/etc/pol
USER_PATH=~/.config/pol

_precmd() {
  [ -z "$POL_CONFIG_FOLDER" ] && POL_CONFIG_FOLDER=$ETC_PATH
  ls -l --time-style=full-iso $POL_CONFIG_FOLDER $USER_PATH 2>/dev/null > $POL_CURRENT_LIST
  diff $POL_CURRENT_LIST $POL_LAST_LIST &> /dev/null
  if [[ $? != 0 ]]; then
    ls -l --time-style=full-iso $POL_CONFIG_FOLDER $USER_PATH 2>/dev/null > $POL_LAST_LIST
    $ZSH/custom/plugins/pol/plugin.js "$ZSH_CACHE_DIR/completions/_pol"
    autoload -U +X compinit && compinit
    source $ZSH_CACHE_DIR/completions/_pol 2> /dev/null
  fi
}

