import React from 'react'
import Avatar from 'react-avatar';

const Client = ({username}) => {
    // render avatar and username
  return (
    <div className="client">
      <div className="avatar"><Avatar name={username} size={28} round="6px" /></div>
      <span className="username">{username}</span>
    </div>
  )
}

export default Client
